/*
 * สถิติผู้เล่นสำหรับ Leaderboard (เฉพาะคนที่ login)
 *
 * ตั้ง USERS_TABLE -> เก็บใน DynamoDB ตารางเดียวกับบัญชีผู้ใช้ (PicassoUsers)
 *                    EC2 เข้าถึงผ่าน VPC Endpoint
 * ไม่ตั้ง          -> เก็บในหน่วยความจำ (dev)
 *
 * ข้อมูลต่อคน: totalScore, gamesPlayed, wins
 */

const LEADERBOARD_SIZE = 10

// Scan ทั้งตารางมีค่าใช้จ่าย เก็บผลไว้สักพัก
const LEADERBOARD_CACHE_TTL = 30000

function sortLeaderboard(entries) {
    return entries
        .filter((entry) => entry.gamesPlayed > 0)
        .sort(
            (a, b) =>
                b.totalScore - a.totalScore ||
                b.wins - a.wins ||
                a.username.localeCompare(b.username)
        )
        .slice(0, LEADERBOARD_SIZE)
}

class MemoryStatsStore {
    constructor() {
        this.stats = new Map()
    }

    async recordResults(results) {
        for (const { username, score, won } of results) {
            const key = username.toLowerCase()

            const current = this.stats.get(key) || {
                username,
                totalScore: 0,
                gamesPlayed: 0,
                wins: 0,
            }

            current.totalScore += score
            current.gamesPlayed += 1
            current.wins += won ? 1 : 0

            this.stats.set(key, current)
        }
    }

    async getLeaderboard() {
        return sortLeaderboard(Array.from(this.stats.values()))
    }
}

class DynamoStatsStore {
    constructor(tableName) {
        const { DynamoDBClient } = require("@aws-sdk/client-dynamodb")
        const {
            DynamoDBDocumentClient,
            UpdateCommand,
            ScanCommand,
        } = require("@aws-sdk/lib-dynamodb")

        this.tableName = tableName
        this.client = DynamoDBDocumentClient.from(new DynamoDBClient({}))
        this.UpdateCommand = UpdateCommand
        this.ScanCommand = ScanCommand

        this.cache = null
        this.cachedAt = 0
    }

    async recordResults(results) {
        await Promise.all(
            results.map(async ({ username, score, won }) => {
                try {
                    await this.client.send(
                        new this.UpdateCommand({
                            TableName: this.tableName,
                            Key: { usernameLower: username.toLowerCase() },
                            UpdateExpression:
                                "ADD totalScore :score, gamesPlayed :one, wins :win",
                            // อัปเดตเฉพาะบัญชีที่มีอยู่จริง
                            ConditionExpression: "attribute_exists(usernameLower)",
                            ExpressionAttributeValues: {
                                ":score": score,
                                ":one": 1,
                                ":win": won ? 1 : 0,
                            },
                        })
                    )
                } catch (error) {
                    if (error.name !== "ConditionalCheckFailedException") {
                        throw error
                    }
                }
            })
        )

        this.cache = null
    }

    async getLeaderboard() {
        if (this.cache && Date.now() - this.cachedAt < LEADERBOARD_CACHE_TTL) {
            return this.cache
        }

        const entries = []
        let startKey

        do {
            const result = await this.client.send(
                new this.ScanCommand({
                    TableName: this.tableName,
                    ProjectionExpression:
                        "username, totalScore, gamesPlayed, wins",
                    FilterExpression: "attribute_exists(gamesPlayed)",
                    ExclusiveStartKey: startKey,
                })
            )

            for (const item of result.Items || []) {
                entries.push({
                    username: item.username,
                    totalScore: item.totalScore || 0,
                    gamesPlayed: item.gamesPlayed || 0,
                    wins: item.wins || 0,
                })
            }

            startKey = result.LastEvaluatedKey
        } while (startKey)

        this.cache = sortLeaderboard(entries)
        this.cachedAt = Date.now()

        return this.cache
    }
}

function createStatsStore(tableName) {
    return tableName ? new DynamoStatsStore(tableName) : new MemoryStatsStore()
}

module.exports = {
    createStatsStore,
}
