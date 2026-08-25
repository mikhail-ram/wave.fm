export interface GraphNode {
  id: string;
  title?: string;
  artist?: string;
  videoId?: string;
  val?: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  currentOpacity?: number;
}

export interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  isBridge?: boolean;
}
