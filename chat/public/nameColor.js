export function nameColor(name) {
    let hash = 2166136261;
    for (const char of name) {
        hash ^= char.codePointAt(0);
        hash = Math.imul(hash, 16777619) >>> 0;
    }
    return `hsl(${hash % 360} 72% 64%)`;
}
