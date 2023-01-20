
export default function hasMarkdownSuffix(str: string): boolean {
    return str.endsWith(".md")
        || str.endsWith(".MD")
        || str.endsWith(".Md")
        || str.endsWith(".mD");
}

export function hasCanvasSuffix(str: string): boolean {
    return str.endsWith(".canvas");
}