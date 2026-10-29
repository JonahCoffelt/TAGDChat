import {
    RegExpMatcher,
    englishDataset,
    englishRecommendedTransformers,
} from "obscenity";

const matcher = new RegExpMatcher({
    ...englishDataset.build(),
    ...englishRecommendedTransformers,
});

export function containsSlur(text) {
    return matcher.hasMatch(text);
}
