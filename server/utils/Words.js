/*
 * คำศัพท์แยกตามหมวด
 *
 * เพิ่มหมวดใหม่ได้ที่นี่ที่เดียว
 * (client ได้รายการหมวดจาก room.settingsOptions)
 */
const WORD_CATEGORIES = {
    animals: {
        label: "Animals",
        words: [
            "cat", "dog", "fish", "rabbit", "elephant",
            "giraffe", "lion", "monkey", "penguin", "snake",
            "turtle", "bird", "horse", "cow", "pig",
            "frog", "duck", "bee", "spider", "octopus",
        ],
    },

    food: {
        label: "Food",
        words: [
            "pizza", "apple", "banana", "cake", "ice cream",
            "hamburger", "coffee", "bread", "egg", "cheese",
            "carrot", "watermelon", "donut", "cookie", "sushi",
            "noodles", "grapes", "cherry", "sandwich", "popcorn",
        ],
    },

    objects: {
        label: "Objects",
        words: [
            "book", "phone", "computer", "guitar", "camera",
            "chair", "table", "umbrella", "clock", "key",
            "glasses", "lamp", "scissors", "pencil", "backpack",
            "bottle", "shoe", "hat", "bed", "television",
        ],
    },

    nature: {
        label: "Nature",
        words: [
            "tree", "sun", "moon", "star", "cloud",
            "rainbow", "flower", "mountain", "river", "beach",
            "volcano", "snowman", "leaf", "rain", "lightning",
            "island", "cactus", "ocean", "fire", "rock",
        ],
    },

    vehicles: {
        label: "Vehicles",
        words: [
            "car", "airplane", "bicycle", "train", "boat",
            "bus", "rocket", "helicopter", "truck", "motorcycle",
            "ship", "taxi", "tractor", "submarine", "skateboard",
        ],
    },

    places: {
        label: "Places",
        words: [
            "house", "school", "castle", "hospital", "bridge",
            "tent", "lighthouse", "farm", "park", "zoo",
            "airport", "library", "pyramid", "tower", "museum",
        ],
    },
}

const MIXED_CATEGORY = "mixed"

const ALL_WORDS = Array.from(
    new Set(
        Object.values(WORD_CATEGORIES).flatMap(
            (category) => category.words
        )
    )
)

const CATEGORY_OPTIONS = [
    {
        id: MIXED_CATEGORY,
        label: "Mixed",
    },
    ...Object.entries(WORD_CATEGORIES).map(
        ([id, category]) => ({
            id,
            label: category.label,
        })
    ),
]

function isValidCategory(categoryId) {
    return CATEGORY_OPTIONS.some(
        (option) => option.id === categoryId
    )
}

function getWordsForCategory(categoryId) {
    return (
        WORD_CATEGORIES[categoryId]?.words ||
        ALL_WORDS
    )
}

module.exports = {
    MIXED_CATEGORY,
    CATEGORY_OPTIONS,
    isValidCategory,
    getWordsForCategory,
}
