import {
    DataSet,
    RegExpMatcher,
    englishDataset,
    englishRecommendedTransformers,
} from "obscenity";

// obscenity's English list mixes slurs with general swearing; keep the slurs.
const generalProfanity = new Set([
    "anal",
    "anus",
    "arse",
    "ass",
    "bastard",
    "bestiality",
    "bitch",
    "blowjob",
    "bollocks",
    "boob",
    "buttplug",
    "cock",
    "cuck",
    "cum",
    "cunt",
    "deepthroat",
    "dick",
    "dildo",
    "doggystyle",
    "double penetration",
    "ejaculate",
    "felch",
    "fellatio",
    "finger bang",
    "fisting",
    "fuck",
    "gangbang",
    "handjob",
    "hentai",
    "hooker",
    "incest",
    "jerk off",
    "jizz",
    "lubejob",
    "masturbate",
    "orgasm",
    "orgy",
    "penis",
    "piss",
    "porn",
    "prick",
    "pussy",
    "rape",
    "scat",
    "semen",
    "sex",
    "shit",
    "slut",
    "tit",
    "turd",
    "twat",
    "vagina",
    "wank",
    "whore",
]);

const matcher = new RegExpMatcher({
    ...new DataSet()
        .addAll(englishDataset)
        .removePhrasesIf((phrase) => generalProfanity.has(phrase.metadata?.originalWord))
        .build(),
    ...englishRecommendedTransformers,
});

export function containsSlur(text) {
    return matcher.hasMatch(text);
}
