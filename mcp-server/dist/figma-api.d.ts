/** Log to stderr so it doesn't interfere with MCP stdio transport */
export declare function log(message: string, ...args: any[]): void;
export declare function parseFigmaUrl(url: string): {
    fileKey: string;
    nodeId?: string;
};
export declare function getFilePages(fileKey: string): Promise<any>;
export declare function getNode(fileKey: string, nodeId: string): Promise<any>;
export interface NodeInspection {
    id: string;
    name: string;
    type: string;
    layout: string[];
    colors: string[];
    typography: string[];
    styles: string[];
    children?: NodeInspection[];
}
export declare function inspectNode(node: any, fileStyles?: Record<string, any>, depth?: number, maxDepth?: number, parentBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
}): NodeInspection;
export interface GapMeasurement {
    from: string;
    to: string;
    direction: 'horizontal' | 'vertical';
    gap: number;
}
export declare function measureGaps(node: any): GapMeasurement[];
/** Recursively measure gaps at all levels of the tree */
export interface RecursiveGapResult {
    parent: string;
    parentId: string;
    gaps: GapMeasurement[];
}
export declare function measureGapsRecursive(node: any, depth?: number, maxDepth?: number): RecursiveGapResult[];
export declare function formatGapsRecursive(results: RecursiveGapResult[]): string;
export declare function exportImage(fileKey: string, nodeId: string, format?: 'png' | 'svg' | 'jpg' | 'pdf', scale?: number): Promise<Buffer>;
export declare function getFileStyles(fileKey: string): Promise<Record<string, any>>;
export declare function formatInspection(node: NodeInspection, indent?: number): string;
export declare function formatGaps(gaps: GapMeasurement[]): string;
