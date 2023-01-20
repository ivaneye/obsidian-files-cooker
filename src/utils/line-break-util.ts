
export function getLinebreak(): string {
    let oss = ["Windows", "Mac", "Linux"];
    let lineBreaks = ["\r\n", "\n", "\n"];
    for (let i = 0; i < oss.length; i++) {
        let os = oss[i];
        if (navigator.userAgent.indexOf(os) != -1) {
            return lineBreaks[i];
        }
    }
    return "\n";
}