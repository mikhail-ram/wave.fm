import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';

interface GraphCanvasProps {
  graphData: { nodes: any[]; links: any[] };
  audioWeight: number; // 0.0 to 1.0
  onNodeClick: (node: any) => void;
  selectedNodeId?: string;
  sourceNodeId?: string;
  destNodeId?: string;
  highlightedPathIds?: string[];
  isInterpolating?: boolean;
  playbackProgressRef?: React.MutableRefObject<number>;
  playbackHistory?: string[];
  manualTargetId?: string | null;
}

export const GraphCanvas: React.FC<GraphCanvasProps> = ({
  graphData,
  audioWeight,
  onNodeClick,
  selectedNodeId,
  sourceNodeId,
  destNodeId,
  highlightedPathIds = [],
  isInterpolating = false,
  playbackProgressRef,
  playbackHistory = [],
  manualTargetId = null,
}) => {
  const fgRef = useRef<any>();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [hoverNode, setHoverNode] = useState<any>(null);

  // Background stars for depth
  const bgStars = useMemo(() => {
    return Array.from({ length: 300 }).map(() => ({
      x: (Math.random() - 0.5) * 4000,
      y: (Math.random() - 0.5) * 4000,
      size: Math.random() * 1.5,
      opacity: Math.random() * 0.5,
      twinkleSpeed: 0.001 + Math.random() * 0.003,
      offset: Math.random() * Math.PI * 2
    }));
  }, []);

  const [minZoom, setMinZoom] = useState(0.01);

  useEffect(() => {
    const ro = new ResizeObserver(entries => {
      if (entries[0]) {
        setDimensions({
          width: entries[0].contentRect.width,
          height: entries[0].contentRect.height
        });
      }
    });
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const [internalGraphData, setInternalGraphData] = useState({ nodes: [], links: [] });
  const masterLinksRef = useRef<any[]>([]);
  const activeLinksRef = useRef<Set<string>>(new Set());

  // Delta Update Engine: Only expand the Master Pool if new edges are discovered
  useEffect(() => {
    if (!graphData || !graphData.nodes || graphData.nodes.length === 0) return;
    
    let changed = false;
    const newLinks = [...masterLinksRef.current];
    const activeSet = new Set<string>();
    
    // Process graphData links
    graphData.links.forEach((incomingLink: any) => {
      const srcStr = incomingLink.source.id || incomingLink.source;
      const tgtStr = incomingLink.target.id || incomingLink.target;
      const edgeId = `${srcStr}-${tgtStr}`;
      activeSet.add(edgeId);
      
      const exists = masterLinksRef.current.some((l: any) => {
        const lSrc = l.source?.id || l.source;
        const lTgt = l.target?.id || l.target;
        return lSrc === srcStr && lTgt === tgtStr;
      });
      
      if (!exists) {
        newLinks.push(incomingLink);
        changed = true;
      }
    });
    
    activeLinksRef.current = activeSet;
    
    if (changed || internalGraphData.nodes.length === 0) {
      masterLinksRef.current = newLinks;
      setInternalGraphData({ nodes: graphData.nodes, links: newLinks });
    }
  }, [graphData, highlightedPathIds]);

  // Update physics strengths smoothly based on the active set!
  useEffect(() => {
    if (fgRef.current && internalGraphData.links.length > 0) {
      fgRef.current.d3Force('link').strength((link: any) => {
        const srcStr = link.source?.id || link.source;
        const tgtStr = link.target?.id || link.target;
        return activeLinksRef.current.has(`${srcStr}-${tgtStr}`) ? 1.0 : 0.0;
      });
      
      // Update distances with new exact scores from backend
      const scoreMap = new Map();
      graphData.links.forEach((l: any) => {
        const srcStr = l.source?.id || l.source;
        const tgtStr = l.target?.id || l.target;
        scoreMap.set(`${srcStr}-${tgtStr}`, l.score);
      });
      
      fgRef.current.d3Force('link').distance((link: any) => {
        const srcStr = link.source?.id || link.source;
        const tgtStr = link.target?.id || link.target;
        const combinedSim = scoreMap.get(`${srcStr}-${tgtStr}`) || 0;
        return 40 + 300 * (1 - Math.max(0, combinedSim));
      });
      
      fgRef.current.d3Force('charge').strength(-300);
      fgRef.current.d3ReheatSimulation();
    }
  }, [graphData.links, internalGraphData.nodes, internalGraphData.links]);
  const [activeDegrees, setActiveDegrees] = useState<Map<string, number>>(new Map());
  
  // Calculate node degrees based ONLY on the dynamically active links
  useEffect(() => {
    if (!graphData.links) return;
    const degrees = new Map<string, number>();
    graphData.nodes.forEach((n: any) => degrees.set(n.id, 0));
    
    graphData.links.forEach((l: any) => {
      const srcId = l.source?.id || l.source;
      const dstId = l.target?.id || l.target;
      degrees.set(srcId, (degrees.get(srcId) || 0) + 1);
      degrees.set(dstId, (degrees.get(dstId) || 0) + 1);
    });
    
    setActiveDegrees(degrees);
  }, [graphData.links]);

  const getNodeSize = useCallback((nodeId: string, isHovered: boolean = false) => {
    const isSelected = nodeId === selectedNodeId;
    const isSource = nodeId === sourceNodeId;
    const isDest = nodeId === destNodeId;
    const isPath = highlightedPathIds.includes(nodeId);
    let baseSize = 1.5;
    if (isSource || isDest || isSelected) { baseSize = 4; }
    else if (isPath || isHovered) { baseSize = 3; }
    const degree = activeDegrees.get(nodeId) || 0;
    const extraSize = Math.max(0, (degree - 5) * 0.5);
    return baseSize + Math.min(extraSize, 8);
  }, [selectedNodeId, sourceNodeId, destNodeId, highlightedPathIds, activeDegrees]);


  const crosshairRef = useRef<HTMLDivElement>(null);
  const bracketsRef = useRef<HTMLDivElement>(null);

  const paintBackground = useCallback((ctx: CanvasRenderingContext2D, globalScale: number) => {
    const time = Date.now();
    ctx.save();
    bgStars.forEach(star => {
      const twinkle = Math.sin(time * star.twinkleSpeed + star.offset) * 0.5 + 0.5;
      ctx.fillStyle = `rgba(255, 255, 255, ${star.opacity * twinkle})`;
      const px = ((star.x + time * 0.005 * star.speed) % 1) * dimensions.width;
      const py = ((star.y + time * 0.002 * star.speed) % 1) * dimensions.height;
      ctx.beginPath();
      ctx.arc(px, py, star.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();

    // Sync CSS HUD Target Position
    if (crosshairRef.current && fgRef.current) {
      // Find the target to lock onto (Always the IMMEDIATE next step)
      let computedTargetId = null;
      if (manualTargetId) {
        computedTargetId = manualTargetId;
      } else if (selectedNodeId) {
        if (highlightedPathIds.length >= 2) {
          // In Interpolate mode, lock onto the next step in the bridge
          const idx = highlightedPathIds.indexOf(selectedNodeId);
          if (idx !== -1 && idx < highlightedPathIds.length - 1) {
            computedTargetId = highlightedPathIds[idx + 1];
          } else if (destNodeId) {
            computedTargetId = destNodeId;
          }
        } else {
          // In Discover mode, lock onto the most similar neighbor, respecting history
          const edges = graphData.links.filter((l: any) => (l.source?.id || l.source) === selectedNodeId);
          const edge = edges.find((l: any) => {
            const tid = typeof l.target === 'object' ? l.target.id : l.target;
            return !playbackHistory.includes(tid);
          }) || edges[0];
          if (edge) {
            computedTargetId = typeof edge.target === 'object' ? edge.target.id : edge.target;
          }
        }
      }

      if (computedTargetId) {
        const destNode = internalGraphData.nodes.find((n: any) => n.id === computedTargetId);
        if (destNode) {
          const coords = fgRef.current.graph2ScreenCoords(destNode.x, destNode.y);
          crosshairRef.current.style.transform = `translate(${coords.x}px, ${coords.y}px)`;
          crosshairRef.current.style.display = 'block';
        }
      } else {
        crosshairRef.current.style.display = 'none';
      }
    }
  }, [internalGraphData.nodes, destNodeId, dimensions, selectedNodeId, graphData, manualTargetId]);


  const labelsToDraw = useMemo(() => {
    if (!graphData || !graphData.nodes) return [];
    return graphData.nodes.filter((node: any) => {
      // Don't draw labels for nodes that are fading out/disconnected
      const degree = activeDegrees.get(node.id) || 0;
      if (degree === 0) return false;
      
      return node.id === hoverNode?.id || 
             node.id === selectedNodeId || 
             node.id === sourceNodeId || 
             node.id === destNodeId || 
             highlightedPathIds.includes(node.id);
    });
  }, [graphData, hoverNode, selectedNodeId, sourceNodeId, destNodeId, highlightedPathIds, activeDegrees]);

  const labelsRef = useRef<{ [key: string]: HTMLDivElement | null }>({});

  useEffect(() => {
    let raf: number;
    const loop = () => {
      if (fgRef.current) {
        const scale = fgRef.current.zoom();
        labelsToDraw.forEach((node: any) => {
          const el = labelsRef.current[node.id];
          if (el && typeof node.x === 'number' && typeof node.y === 'number') {
            const { x, y } = fgRef.current.graph2ScreenCoords(node.x, node.y);
            const isHovered = hoverNode && node.id === hoverNode.id;
            const radius = getNodeSize(node.id, isHovered) * scale;
            el.style.left = `${x}px`;
            el.style.top = `${y}px`;
            el.style.transform = `translate(-50%, calc(${radius}px + 8px))`;
          }
        });
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [labelsToDraw, hoverNode, getNodeSize]);

  const hoverStartRef = useRef<number>(0);
  const prevHoverNodeRef = useRef<string | null>(null);

  useEffect(() => {
    if (hoverNode?.id !== prevHoverNodeRef.current) {
      hoverStartRef.current = Date.now();
      prevHoverNodeRef.current = hoverNode?.id || null;
    }
  }, [hoverNode]);

  const paintNode = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const isSelected = node.id === selectedNodeId;
    const isSource = node.id === sourceNodeId;
    const isDest = node.id === destNodeId;
    const isHovered = hoverNode && node.id === hoverNode.id;
    const isPath = highlightedPathIds.includes(node.id);
    const hasInterpolation = sourceNodeId && destNodeId;

    const degree = activeDegrees.get(node.id) || 0;
    
    // Smoothly fade out disconnected nodes
    const targetOpacity = degree > 0 ? 1.0 : 0.0;
    if (node.currentOpacity === undefined) node.currentOpacity = targetOpacity;
    node.currentOpacity += (targetOpacity - node.currentOpacity) * 0.1;
    
    if (node.currentOpacity < 0.01) return; // Don't draw fully faded nodes

    let color = '#ffffff';
    let opacity = node.currentOpacity;
    const size = getNodeSize(node.id, isHovered);
    
    // Dim inactive nodes during interpolation
    if (hasInterpolation && !isSource && !isDest && !isPath) {
      opacity *= 0.15;
    }

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5 / globalScale;
    
    // Draw solid black square to mask lines behind it, then stroke
    ctx.beginPath();
    ctx.rect(node.x - size, node.y - size, size * 2, size * 2);
    ctx.fillStyle = '#000000';
    ctx.fill();
    ctx.stroke();
    
    // If it's a key node (active or source), fill it and glow
    if (isSelected || (isSource && !hasInterpolation)) {
      ctx.fillStyle = color;
      ctx.fill();
      ctx.shadowBlur = 10;
      ctx.shadowColor = color;
      ctx.stroke();
    }
    
    // For the destination node, do not fill it (so it looks unexplored), 
    // but give it a thicker border and a glow to stand out as a target
    if (isDest) {
      ctx.lineWidth = 3.0 / globalScale;
      ctx.shadowBlur = 8;
      ctx.shadowColor = color;
      ctx.stroke();
      
      // Draw target brackets around destination
      const gap = size * 1.5;
      const bSize = size * 0.5;
      ctx.beginPath();
      // Top left
      ctx.moveTo(node.x - gap, node.y - gap + bSize);
      ctx.lineTo(node.x - gap, node.y - gap);
      ctx.lineTo(node.x - gap + bSize, node.y - gap);
      // Top right
      ctx.moveTo(node.x + gap - bSize, node.y - gap);
      ctx.lineTo(node.x + gap, node.y - gap);
      ctx.lineTo(node.x + gap, node.y - gap + bSize);
      // Bottom left
      ctx.moveTo(node.x - gap, node.y + gap - bSize);
      ctx.lineTo(node.x - gap, node.y + gap);
      ctx.lineTo(node.x - gap + bSize, node.y + gap);
      // Bottom right
      ctx.moveTo(node.x + gap - bSize, node.y + gap);
      ctx.lineTo(node.x + gap, node.y + gap);
      ctx.lineTo(node.x + gap, node.y + gap - bSize);
      ctx.stroke();
    }
    
    // Calculate current dynamic target lock
    let currentTargetId = null;
    if (selectedNodeId) {
      if (highlightedPathIds.length >= 2) {
        const idx = highlightedPathIds.indexOf(selectedNodeId);
        if (idx !== -1 && idx < highlightedPathIds.length - 1) {
          currentTargetId = highlightedPathIds[idx + 1];
        }
      } else {
        const edge = graphData.links.find((l: any) => (l.source?.id || l.source) === selectedNodeId);
        if (edge) {
          currentTargetId = typeof edge.target === 'object' ? edge.target.id : edge.target;
        }
      }
    }

    
    ctx.restore();
  }, [selectedNodeId, sourceNodeId, destNodeId, highlightedPathIds, hoverNode, activeDegrees, getNodeSize]);

  const paintPointerArea = useCallback((node: any, color: string, ctx: CanvasRenderingContext2D) => {
    const degree = activeDegrees.get(node.id) || 0;
    if (degree === 0) return;
    
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(node.x, node.y, 15, 0, 2 * Math.PI); // 15px magnetic hover radius
    ctx.fill();
  }, [activeDegrees]);

  const paintBridge = useCallback((ctx: CanvasRenderingContext2D, globalScale: number) => {
    let path = highlightedPathIds;
    
    // In Discover Mode, dynamically create the "planned" bridge path of length 2
    if (path.length < 2 && selectedNodeId) {
      if (manualTargetId) {
        path = [selectedNodeId, manualTargetId];
      } else {
        const edges = graphData.links.filter((l: any) => (l.source?.id || l.source) === selectedNodeId);
        const edge = edges.find((l: any) => {
          const tid = typeof l.target === 'object' ? l.target.id : l.target;
          return !playbackHistory.includes(tid);
        }) || edges[0];
        if (edge) {
          const targetId = typeof edge.target === 'object' ? edge.target.id : edge.target;
          path = [selectedNodeId, targetId];
        }
      }
    }
    
    if (path.length < 2) return;
    
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5 / globalScale;
    
    const currentIndex = path.indexOf(selectedNodeId);

    for (let i = 0; i < path.length - 1; i++) {
      // Determine if this segment has been traversed
      // If we are at C (index 2), then A->B (i=0) and B->C (i=1) have been traversed
      const isTraversed = currentIndex !== -1 && i < currentIndex;
      
      if (isTraversed) {
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.5; // Slightly dim the traversed history
      } else {
        ctx.setLineDash([4, 4]);
        ctx.globalAlpha = 1.0;
      }

      const src = graphData.nodes.find((n: any) => n.id === path[i]);
      const dst = graphData.nodes.find((n: any) => n.id === path[i+1]);
      if (src && dst && typeof src.x === 'number' && typeof dst.x === 'number') {
        const d = Math.hypot(dst.x - src.x, dst.y - src.y);
        const angle = Math.atan2(dst.y - src.y, dst.x - src.x);
        
        const srcRadius = getNodeSize(src.id);
        const dstRadius = getNodeSize(dst.id);
        
        if (d > srcRadius + dstRadius) {
          ctx.save();
          ctx.translate(src.x, src.y);
          ctx.rotate(angle);
          ctx.beginPath();
          ctx.moveTo(srcRadius, 0);
          ctx.lineTo(d - dstRadius, 0);
          ctx.stroke();
          ctx.restore();
        }
      }
    }
    
    ctx.restore();
  }, [highlightedPathIds, graphData, getNodeSize, selectedNodeId, playbackHistory]);

  const paintPacket = useCallback((ctx: CanvasRenderingContext2D, globalScale: number) => {
    const progress = playbackProgressRef?.current || 0;
    if (!selectedNodeId || progress === 0) return;
    
    let targetId = null;
    const sourceId = selectedNodeId;

    if (highlightedPathIds.length >= 2) {
      // Interpolate mode: find where we are in the path
      const idx = highlightedPathIds.indexOf(selectedNodeId);
      if (idx !== -1 && idx < highlightedPathIds.length - 1) {
        targetId = highlightedPathIds[idx + 1];
      }
    } else {
      // Discover mode: pick the first out-edge target dynamically respecting history
      const edges = graphData.links.filter((l: any) => l.source?.id === selectedNodeId || l.source === selectedNodeId);
      const edge = edges.find((l: any) => {
        const tid = typeof l.target === 'object' ? l.target.id : l.target;
        return !playbackHistory.includes(tid);
      }) || edges[0];
      
      if (edge) {
        targetId = typeof edge.target === 'object' ? edge.target.id : edge.target;
      }
    }

    if (!targetId) return;

    const source = graphData.nodes.find((n: any) => n.id === sourceId);
    const target = graphData.nodes.find((n: any) => n.id === targetId);

    if (source && target && typeof source.x === 'number' && typeof target.x === 'number') {
      const d = Math.hypot(target.x - source.x, target.y - source.y);
      const angle = Math.atan2(target.y - source.y, target.x - source.x);
      
      const srcRadius = getNodeSize(source.id) + 2; // + 2px extra padding
      const dstRadius = getNodeSize(target.id) + 2;
      
      ctx.save();
      ctx.translate(source.x, source.y);
      ctx.rotate(angle);

      // Draw predictive dashed line in discover mode
      if (highlightedPathIds.length < 2) {
        ctx.beginPath();
        ctx.moveTo(srcRadius, 0);
        ctx.lineTo(d - dstRadius, 0);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1 / globalScale;
        ctx.setLineDash([2, 4]);
        ctx.stroke();
      }

      const d_eff = Math.max(0, d - srcRadius - dstRadius);
      const filledDist = d_eff * progress;

      // Draw geometric line and arrow head
      ctx.beginPath();
      ctx.moveTo(srcRadius, 0);
      ctx.lineTo(srcRadius + filledDist, 0);
      
      if (progress < 1.0) {
        const arrowSize = 4 / globalScale;
        ctx.moveTo(srcRadius + filledDist, 0);
        ctx.lineTo(srcRadius + filledDist - arrowSize, -arrowSize);
        ctx.moveTo(srcRadius + filledDist, 0);
        ctx.lineTo(srcRadius + filledDist - arrowSize, arrowSize);
      }
      
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5 / globalScale;
      ctx.setLineDash([]); // Ensure solid line for arrow
      ctx.stroke();
      
      // Brutalist subtle glow
      ctx.shadowBlur = 6;
      ctx.shadowColor = '#ffffff';
      ctx.stroke();
      
      ctx.restore();
    }
  }, [selectedNodeId, highlightedPathIds, graphData, playbackProgressRef, getNodeSize, playbackHistory]);

  return (
    <div className="absolute inset-0 z-0 bg-black overflow-hidden pointer-events-auto custom-graph-cursor" ref={containerRef}>
      <div ref={crosshairRef} className="hud-target-wrapper">
        <div className="hud-crosshair-brackets">
          <div className="hud-crosshair-brackets-inner"></div>
        </div>
      </div>
      <ForceGraph2D
        ref={fgRef}
        width={dimensions.width}
        height={dimensions.height}
        graphData={internalGraphData}
        minZoom={minZoom}
        maxZoom={6}
        nodeRelSize={1}
        backgroundColor="#000000"
        nodeLabel="" 
        onBackgroundClick={() => {}}
        onRenderFramePost={(ctx, globalScale) => {
          paintBackground(ctx, globalScale);
          paintBridge(ctx, globalScale);
          paintPacket(ctx, globalScale);
        }}
        nodePointerAreaPaint={paintPointerArea}
        nodeCanvasObject={paintNode}
        nodeColor={() => '#ffffff'}
        linkVisibility={(link: any) => {
          const src = link.source?.id || link.source;
          const tgt = link.target?.id || link.target;
          return activeLinksRef.current?.has(`${src}-${tgt}`);
        }}
        linkColor={(link: any) => {
          // Highlight links if they connect to the hovered node, OR if in Discover mode, the selected node
          const isDiscoverMode = highlightedPathIds.length < 2;
          const isActive = 
            (isDiscoverMode && (link.source?.id === selectedNodeId || link.target?.id === selectedNodeId)) ||
            link.source?.id === hoverNode?.id || link.target?.id === hoverNode?.id;
            
          return isActive ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.05)';
        }}
        linkWidth={0.5}
        // Force 60FPS render loop by injecting an invisible particle on the active edge
        linkDirectionalParticles={(link: any) => {
          const src = link.source?.id || link.source;
          return (src === selectedNodeId) ? 1 : 0;
        }}
        linkDirectionalParticleWidth={0}
        onNodeHover={(node) => setHoverNode(node)}
        onNodeClick={(node) => {
          onNodeClick(node);
          fgRef.current.centerAt(node.x, node.y, 1000);
          fgRef.current.zoom(3, 1000);
        }}
        d3VelocityDecay={0.3}
        cooldownTicks={100}
      />
      {labelsToDraw.map(node => (
        <HackerLabel 
          key={node.id} 
          node={node} 
          isHovered={node.id === hoverNode?.id}
          color="#ffffff"
          elRef={(el: any) => { if (el) labelsRef.current[node.id] = el; }}
        />
      ))}
    </div>
  );
};

function HackerLabel({ node, isHovered, color, elRef }: any) {
  const [title, setTitle] = useState(String(node.title || "UNKNOWN").toUpperCase());
  const [artist, setArtist] = useState(String(node.artist || "UNKNOWN").toUpperCase());
  
  useEffect(() => {
    if (isHovered) {
      const origTitle = String(node.title || "UNKNOWN").toUpperCase();
      const origArtist = String(node.artist || "UNKNOWN").toUpperCase();
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*+<>[]{}";
      const start = Date.now();
      const duration = 400;
      
      const interval = setInterval(() => {
        const elapsed = Date.now() - start;
        if (elapsed >= duration) {
          setTitle(origTitle);
          setArtist(origArtist);
          clearInterval(interval);
          return;
        }
        
        const progress = elapsed / duration;
        setTitle(origTitle.split('').map((char: string, i: number) => {
          if (char === ' ') return ' ';
          if (i / origTitle.length < progress) return char;
          return chars[Math.floor(Math.random() * chars.length)];
        }).join(''));
        
        setArtist(origArtist.split('').map((char: string, i: number) => {
          if (char === ' ') return ' ';
          if (i / origArtist.length < progress) return char;
          return chars[Math.floor(Math.random() * chars.length)];
        }).join(''));
      }, 30);
      
      return () => {
        clearInterval(interval);
        setTitle(origTitle);
        setArtist(origArtist);
      };
    } else {
      setTitle((node.title || "UNKNOWN").toUpperCase());
      setArtist((node.artist || "UNKNOWN").toUpperCase());
    }
  }, [isHovered, node.title, node.artist]);

  return (
    <div 
      ref={elRef}
      className="absolute top-0 left-0 pointer-events-none flex flex-col items-start justify-center bg-black/85 border border-white/30 px-2 py-1"
      style={{ zIndex: isHovered ? 50 : 10 }}
    >
      <div className="font-bold font-mono text-xs whitespace-nowrap" style={{ color }}>
        &gt;{title}
      </div>
      <div className="font-mono text-[10px] whitespace-nowrap text-white/60">
        [{artist}]
      </div>
    </div>
  );
};
