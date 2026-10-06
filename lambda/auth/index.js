/*
 * Picasso Auth Lambda (แทน Cognito)
 *
 * API Gateway (HTTP API) -> Lambda นี้ -> DynamoDB
 *
 *   POST /auth/register  { username, password } -> { token, user }
 *   POST /auth/login     { username, password } -> { token, user }
 *   GET  /auth/me        Authorization: Bearer <token> -> { user }
 *
 * Environment variables
 *   USERS_TABLE    ชื่อตาราง DynamoDB (partition key: usernameLower, String)
 *                  ไม่ตั้ง = เก็บในหน่วยความจำ (ใช้ตอน dev เท่านั้น)
 *   AUTH_SECRET    secret สำหรับเซ็น token (ต้องตรงกับ server เกม)
 *   ALLOWED_ORIGIN origin ของหน้าเว็บ (CORS) เช่น http://xxx.s3-website...
 *
 * ไม่มี dependency นอกจาก AWS SDK v3 ที่ Lambda runtime (Node 18+) มีให้อยู่แล้ว
 */

const crypto = require("crypto")
const { promisify } = require("util")

const scrypt = promisify(crypto.scrypt)

const USERS_TABLE = process.env.USERS_TABLE
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*"

const DEV_AUTH_SECRET = "picasso-dev-secret"
const MIN_AUTH_SECRET_LENGTH = 32

// Lambda ตั้งค่านี้ให้เอง = รันบน AWS จริง (ไม่ใช่ local-server.js)
const IS_LAMBDA = Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME)

/*
 * บน AWS ต้องตั้ง AUTH_SECRET เสมอ
 * ค่าสำรองอยู่ในโค้ดบน GitHub ใครก็ปลอม token ได้
 */
if (IS_LAMBDA) {
    const secret = process.env.AUTH_SECRET || ""

    if (
        !secret ||
        secret === DEV_AUTH_SECRET ||
        secret.length < MIN_AUTH_SECRET_LENGTH
    ) {
        throw new Error(
            `AUTH_SECRET must be set to a random value of at least ${MIN_AUTH_SECRET_LENGTH} characters (same value as the game server).`
        )
    }
}

const AUTH_SECRET = process.env.AUTH_SECRET || DEV_AUTH_SECRET

const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60

const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/
const MIN_PASSWORD_LENGTH = 6
const MAX_PASSWORD_LENGTH = 100

if (!process.env.AUTH_SECRET) {
    console.warn("AUTH_SECRET is not set. Using an insecure development secret.")
}

/*
 * ------------------------------------------------
 * Users storage
 * ------------------------------------------------
 */

function createUserStore() {
    if (!USERS_TABLE) {
        const users = new Map()

        return {
            async get(usernameLower) {
                return users.get(usernameLower) || null
            },

            // คืน false ถ้ามีชื่อนี้แล้ว
            async create(user) {
                if (users.has(user.usernameLower)) {
                    return false
                }

                users.set(user.usernameLower, user)

                return true
            },
        }
    }

    const { DynamoDBClient } = require("@aws-sdk/client-dynamodb")
    const {
        DynamoDBDocumentClient,
        GetCommand,
        PutCommand,
    } = require("@aws-sdk/lib-dynamodb")

    const client = DynamoDBDocumentClient.from(new DynamoDBClient({}))

    return {
        async get(usernameLower) {
            const result = await client.send(
                new GetCommand({
                    TableName: USERS_TABLE,
                    Key: { usernameLower },
                })
            )

            return result.Item || null
        },

        async create(user) {
            try {
                await client.send(
                    new PutCommand({
                        TableName: USERS_TABLE,
                        Item: user,
                        // กันชื่อซ้ำ (สมัครพร้อมกันก็ไม่ซ้ำ)
                        ConditionExpression: "attribute_not_exists(usernameLower)",
                    })
                )

                return true
            } catch (error) {
                if (error.name === "ConditionalCheckFailedException") {
                    return false
                }

                throw error
            }
        },
    }
}

const userStore = createUserStore()

/*
 * ------------------------------------------------
 * Password (scrypt + salt)
 * ------------------------------------------------
 */

async function hashPassword(password) {
    const salt = crypto.randomBytes(16)

    const hash = await scrypt(password, salt, 64)

    return `${salt.toString("hex")}:${hash.toString("hex")}`
}

async function verifyPassword(password, stored) {
    const [saltHex, hashHex] = String(stored || "").split(":")

    if (!saltHex || !hashHex) {
        return false
    }

    const expected = Buffer.from(hashHex, "hex")

    const actual = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length)

    return crypto.timingSafeEqual(expected, actual)
}

/*
 * ------------------------------------------------
 * Token (JWT HS256)
 *
 * server เกมตรวจ token แบบเดียวกันใน server/utils/AuthToken.js
 * ------------------------------------------------
 */

const base64url = (value) => Buffer.from(value).toString("base64url")

function signToken(user) {
    const now = Math.floor(Date.now() / 1000)

    const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))

    const payload = base64url(
        JSON.stringify({
            sub: user.usernameLower,
            username: user.username,
            iat: now,
            exp: now + TOKEN_TTL_SECONDS,
        })
    )

    const signature = crypto
        .createHmac("sha256", AUTH_SECRET)
        .update(`${header}.${payload}`)
        .digest("base64url")

    return `${header}.${payload}.${signature}`
}

function verifyToken(token) {
    const [header, payload, signature] = String(token || "").split(".")

    if (!header || !payload || !signature) {
        return null
    }

    const expected = crypto
        .createHmac("sha256", AUTH_SECRET)
        .update(`${header}.${payload}`)
        .digest()

    const actual = Buffer.from(signature, "base64url")

    if (
        actual.length !== expected.length ||
        !crypto.timingSafeEqual(actual, expected)
    ) {
        return null
    }

    try {
        const data = JSON.parse(Buffer.from(payload, "base64url").toString())

        if (!data.exp || data.exp * 1000 < Date.now()) {
            return null
        }

        return data
    } catch {
        return null
    }
}

/*
 * ------------------------------------------------
 * HTTP helpers
 * ------------------------------------------------
 */

function response(statusCode, body) {
    return {
        statusCode,
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        },
        body: body === undefined ? "" : JSON.stringify(body),
    }
}

function parseBody(event) {
    if (!event.body) {
        return {}
    }

    try {
        const raw = event.isBase64Encoded
            ? Buffer.from(event.body, "base64").toString()
            : event.body

        return JSON.parse(raw)
    } catch {
        return {}
    }
}

function readCredentials(event) {
    const body = parseBody(event)

    return {
        username: String(body.username || "").trim(),
        password: String(body.password || ""),
    }
}

const publicUser = (user) => ({ username: user.username })

/*
 * ------------------------------------------------
 * Routes
 * ------------------------------------------------
 */

async function register(event) {
    const { username, password } = readCredentials(event)

    if (!USERNAME_PATTERN.test(username)) {
        return response(400, { error: "INVALID_USERNAME" })
    }

    if (
        password.length < MIN_PASSWORD_LENGTH ||
        password.length > MAX_PASSWORD_LENGTH
    ) {
        return response(400, { error: "INVALID_PASSWORD" })
    }

    const user = {
        usernameLower: username.toLowerCase(),
        username,
        passwordHash: await hashPassword(password),
        createdAt: new Date().toISOString(),
    }

    if (!(await userStore.create(user))) {
        return response(409, { error: "USERNAME_TAKEN" })
    }

    return response(201, {
        token: signToken(user),
        user: publicUser(user),
    })
}

async function login(event) {
    const { username, password } = readCredentials(event)

    const user = await userStore.get(username.toLowerCase())

    // ตอบเหมือนกันทั้งชื่อผิดและรหัสผิด ไม่บอกว่ามีชื่อนี้หรือไม่
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
        return response(401, { error: "INVALID_CREDENTIALS" })
    }

    return response(200, {
        token: signToken(user),
        user: publicUser(user),
    })
}

async function me(event) {
    const authorization =
        event.headers?.authorization || event.headers?.Authorization || ""

    const data = verifyToken(authorization.replace(/^Bearer\s+/i, ""))

    if (!data) {
        return response(401, { error: "UNAUTHORIZED" })
    }

    return response(200, {
        user: { username: data.username },
    })
}

exports.handler = async (event) => {
    // รองรับทั้ง HTTP API (payload v2) และ REST API (v1)
    const method = event.requestContext?.http?.method || event.httpMethod
    const path = event.rawPath || event.path || ""

    if (method === "OPTIONS") {
        return response(204)
    }

    try {
        if (method === "POST" && path.endsWith("/auth/register")) {
            return await register(event)
        }

        if (method === "POST" && path.endsWith("/auth/login")) {
            return await login(event)
        }

        if (method === "GET" && path.endsWith("/auth/me")) {
            return await me(event)
        }

        return response(404, { error: "NOT_FOUND" })
    } catch (error) {
        console.error("Auth error:", error)

        return response(500, { error: "SERVER_ERROR" })
    }
}
