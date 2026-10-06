/*
 * ส่งจำนวนผู้เล่นที่ต่ออยู่กับเครื่องนี้ขึ้น CloudWatch
 *
 * Auto Scaling ใช้ค่านี้ (Average ต่อเครื่อง) ตัดสินใจเพิ่ม/ลดเครื่อง
 * เกม WebSocket ใช้ CPU น้อย scale ตาม CPU อย่างเดียวจะไม่ค่อยขยับ
 *
 * เปิดใช้เมื่อตั้ง METRICS_NAMESPACE และ ASG_NAME
 *   METRICS_NAMESPACE=Picasso
 *   ASG_NAME=picasso-asg
 *
 * EC2 ต้องมี IAM role ที่ทำ cloudwatch:PutMetricData ได้
 */

const PUBLISH_INTERVAL = 60000

function startMetricsPublisher({ io, instanceId }) {
    const namespace = process.env.METRICS_NAMESPACE
    const asgName = process.env.ASG_NAME

    if (!namespace || !asgName) {
        return () => {}
    }

    const {
        CloudWatchClient,
        PutMetricDataCommand,
    } = require("@aws-sdk/client-cloudwatch")

    const client = new CloudWatchClient({})

    async function publish() {
        const connections = io.engine.clientsCount

        try {
            await client.send(
                new PutMetricDataCommand({
                    Namespace: namespace,
                    MetricData: [
                        {
                            MetricName: "ActiveConnections",
                            Dimensions: [
                                {
                                    Name: "AutoScalingGroupName",
                                    Value: asgName,
                                },
                            ],
                            Unit: "Count",
                            Value: connections,
                        },
                    ],
                })
            )
        } catch (error) {
            console.error(`[${instanceId}] PutMetricData failed:`, error.message)
        }
    }

    publish()

    const timer = setInterval(publish, PUBLISH_INTERVAL)

    console.log(
        `[${instanceId}] Publishing ${namespace}/ActiveConnections for ${asgName}`
    )

    return () => clearInterval(timer)
}

module.exports = {
    startMetricsPublisher,
}
