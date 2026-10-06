/*
 * รัน Auth Lambda ในเครื่อง (ตอน dev ไม่ต้องมี AWS)
 *
 *   node lambda/auth/local-server.js
 *
 * แปลง HTTP request เป็น event แบบ API Gateway HTTP API แล้วเรียก handler
 * ไม่ตั้ง USERS_TABLE = เก็บ user ในหน่วยความจำ (หายเมื่อปิด)
 *
 * client (Vite) proxy /auth มาที่นี่ (ดู client/vite.config.js)
 */

const http = require("http")

const { handler } = require("./index")

const PORT = process.env.AUTH_PORT || 3001

const server = http.createServer((req, res) => {
    const chunks = []

    req.on("data", (chunk) => chunks.push(chunk))

    req.on("end", async () => {
        const url = new URL(req.url, `http://${req.headers.host}`)

        const event = {
            rawPath: url.pathname,
            headers: req.headers,
            body: Buffer.concat(chunks).toString() || undefined,
            isBase64Encoded: false,
            requestContext: {
                http: {
                    method: req.method,
                },
            },
        }

        const result = await handler(event)

        res.writeHead(result.statusCode, result.headers)
        res.end(result.body)
    })
})

server.listen(PORT, () => {
    console.log(`Auth (local Lambda) running on port ${PORT}`)
})
