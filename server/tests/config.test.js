/*
 * Test: server ต้องไม่ยอมเริ่มเมื่อตั้งค่าผิด (กันปัญหาที่หาสาเหตุยากบน AWS)
 */
const { test, describe } = require("node:test")
const assert = require("node:assert/strict")
const net = require("node:net")

const { runServerUntilExit } = require("./helpers")

const STRONG_SECRET = "a".repeat(64)

describe("startup configuration", () => {
    for (const [name, env, message] of [
        ["production without AUTH_SECRET", { NODE_ENV: "production", AUTH_SECRET: "" }, /AUTH_SECRET is not set/],
        ["production with placeholder secret", { NODE_ENV: "production", AUTH_SECRET: "CHANGE-ME" }, /AUTH_SECRET is not set/],
        ["production with short secret", { NODE_ENV: "production", AUTH_SECRET: "abc123" }, /too short/],
        ["Auto Scaling without Redis", { ASG_NAME: "picasso-asg", AUTH_SECRET: STRONG_SECRET }, /REDIS_URL is not/],
    ]) {
        test(`refuses to start: ${name}`, async () => {
            const { code, output } = await runServerUntilExit({ PORT: "0", ...env })

            assert.equal(code, 1)
            assert.match(output, message)
        })
    }

    test("unreachable Redis fails fast with a readable message and masked password", async () => {
        // port ที่ไม่มีอะไรฟังอยู่
        const port = await new Promise((resolve) => {
            const probe = net.createServer().listen(0, () => {
                const { port: freePort } = probe.address()
                probe.close(() => resolve(freePort))
            })
        })

        const startedAt = Date.now()

        const { code, output } = await runServerUntilExit({
            PORT: "0",
            REDIS_URL: `redis://user:secretpass@localhost:${port}`,
        })

        assert.equal(code, 1)
        assert.match(output, /Cannot connect to Redis/)
        assert.match(output, /ECONNREFUSED/)
        assert.ok(!output.includes("secretpass"), "password must be masked")
        assert.ok(Date.now() - startedAt < 20000, "should give up within ~10 seconds")
    })
})
