const crypto = require("crypto")

/*
 * ตรวจ token ที่ Auth Lambda ออกให้ (JWT HS256)
 * ต้องใช้ AUTH_SECRET เดียวกับ Lambda (lambda/auth/index.js)
 *
 * คืน payload { username, ... } หรือ null ถ้าไม่ถูกต้อง / หมดอายุ
 */
function verifyAuthToken(token, secret) {
    const [header, payload, signature] = String(token || "").split(".")

    if (!header || !payload || !signature || !secret) {
        return null
    }

    const expected = crypto
        .createHmac("sha256", secret)
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

        if (!data.exp || data.exp * 1000 < Date.now() || !data.username) {
            return null
        }

        return data
    } catch {
        return null
    }
}

module.exports = {
    verifyAuthToken,
}
