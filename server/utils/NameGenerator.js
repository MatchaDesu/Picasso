const adjectives = [
    "Happy",
    "Sleepy",
    "Funny",
    "Lucky",
    "Little",
    "Crazy",
    "Quiet",
    "Pixel",
]

const animals = [
    "Cat",
    "Fox",
    "Panda",
    "Bunny",
    "Tiger",
    "Koala",
    "Otter",
    "Bear",
]

function generateGuestName() {

    const adjective =
        adjectives[
        Math.floor(
            Math.random() *
            adjectives.length
        )
        ]

    const animal =
        animals[
        Math.floor(
            Math.random() *
            animals.length
        )
        ]

    const number =
        Math.floor(
            Math.random() * 9000
        ) + 1000

    return `${adjective}${animal}${number}`
}

module.exports = {
    generateGuestName,
}