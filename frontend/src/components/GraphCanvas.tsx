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
}) => {
  const fgRef = useRef<any>();
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

  useEffect(() => {
    const handleResize = () => setDimensions({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (fgRef.current && graphData.links.length > 0) {
      fgRef.current.d3Force('link').distance((link: any) => {
        const simAudio = link.sim_audio || 0;
        const simText = link.sim_text || 0;
        const combinedSim = audioWeight * simAudio + (1 - audioWeight) * simText;
        return 20 + 200 * (1 - Math.max(0, combinedSim));
      });
      fgRef.current.d3Force('charge').strength(-150); // Spread them out nicely
      fgRef.current.d3ReheatSimulation();
    }
  }, [audioWeight, graphData.links]);

  const paintBackground = useCallback((ctx: CanvasRenderingContext2D, globalScale: number) => {
    const time = Date.now();
    ctx.save();
    bgStars.forEach(star => {
      const twinkle = Math.sin(time * star.twinkleSpeed + star.offset) * 0.5 + 0.5;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size / globalScale, 0, 2 * Math.PI);
      ctx.fillStyle = `rgba(255, 255, 255, ${star.opacity * twinkle})`;
      ctx.fill();
    });
    ctx.restore();
  }, [bgStars]);

  const paintNode = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const isSelected = node.id === selectedNodeId;
    const isSource = node.id === sourceNodeId;
    const isDest = node.id === destNodeId;
    const isHovered = hoverNode && node.id === hoverNode.id;
    const isPath = highlightedPathIds.includes(node.id);
    const hasInterpolation = sourceNodeId && destNodeId;

    // Twinkle effect for nodes
    const time = Date.now();
    const twinkle = Math.sin(time * 0.002 + node.id.charCodeAt(0)) * 0.2 + 0.8;

    // Determine color based on ID hash
    const colors = ['#00f3ff', '#b700ff', '#ff007f', '#00ffaa', '#ffd700', '#ff6b00', '#ffffff'];
    const colorIndex = node.id.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0) % colors.length;
    let baseColor = colors[colorIndex];

    let radius = 2.5;
    let color = baseColor;
    let opacity = 0.5 * twinkle;
    let drawLabel = isHovered;

    if (isSource) { radius = 6; color = '#ffffff'; opacity = 1; drawLabel = true; }
    else if (isDest) { radius = 6; color = '#ffffff'; opacity = 1; drawLabel = true; }
    else if (isPath) { radius = 5; color = '#ffffff'; opacity = 1; drawLabel = true; }
    else if (isSelected) { radius = 6; color = '#ffffff'; opacity = 1; drawLabel = true; }
    else if (isHovered) { radius = 5; color = '#ffffff'; opacity = 1; }
    
    // Dim inactive nodes during interpolation
    if (hasInterpolation && !isSource && !isDest && !isPath) {
      opacity *= 0.15;
    }

    ctx.save();
    ctx.globalAlpha = opacity;
    
    // Futuristic Search Radius for Selected Node
    if (isSelected && !hasInterpolation) {
      const pulse = (time % 3000) / 3000; // 0 to 1
      ctx.beginPath();
      ctx.arc(node.x, node.y, 50 + pulse * 100, 0, 2 * Math.PI);
      ctx.strokeStyle = `rgba(255, 255, 255, ${(1 - pulse) * 0.3})`;
      ctx.lineWidth = 1 / globalScale;
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Glow
    if (opacity > 0.3) {
      ctx.shadowBlur = 15;
      ctx.shadowColor = color;
    }

    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();

    // Elegant Typography
    if (drawLabel && globalScale > 0.5) {
      const fontSize = 14 / globalScale;
      ctx.font = `300 ${fontSize}px system-ui, sans-serif`;
      ctx.fillStyle = `rgba(255, 255, 255, 0.9)`;
      ctx.shadowBlur = 0;
      
      const title = node.title.toUpperCase();
      const artist = node.artist.toUpperCase();
      
      ctx.fillText(title, node.x + radius + 8, node.y - 2);
      ctx.font = `300 ${fontSize * 0.7}px system-ui, sans-serif`;
      ctx.fillStyle = `rgba(255, 255, 255, 0.5)`;
      ctx.fillText(artist, node.x + radius + 8, node.y + (fontSize * 0.7) + 2);
    }
    
    ctx.restore();
  }, [selectedNodeId, sourceNodeId, destNodeId, highlightedPathIds, hoverNode]);

  const paintBridge = useCallback((ctx: CanvasRenderingContext2D, globalScale: number) => {
    if (highlightedPathIds.length < 2) return;
    
    const nodeMap = new Map();
    fgRef.current?.graphData().nodes.forEach((n: any) => nodeMap.set(n.id, n));
    
    ctx.save();
    ctx.beginPath();
    let started = false;
    
    for (const id of highlightedPathIds) {
      const node = nodeMap.get(id);
      if (node && typeof node.x === 'number' && typeof node.y === 'number') {
        if (!started) {
          ctx.moveTo(node.x, node.y);
          started = true;
        } else {
          ctx.lineTo(node.x, node.y);
        }
      }
    }
    
    if (started) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 2 / globalScale;
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#ffffff';
      ctx.stroke();
    }
    ctx.restore();
  }, [highlightedPathIds]);

  return (
    <div className="absolute inset-0 z-0 bg-[#0c0d14] overflow-hidden pointer-events-auto">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#1d1b2e] via-[#0c0d14] to-[#040508] opacity-90" />
      <ForceGraph2D
        ref={fgRef}
        width={dimensions.width}
        height={dimensions.height}
        graphData={graphData}
        nodeLabel="" 
        onBackgroundClick={() => {}}
        onRenderFramePre={paintBackground}
        onRenderFramePost={paintBridge}
        nodeCanvasObject={paintNode}
        nodeColor={() => '#ffffff'}
        linkColor={(link: any) => {
          const isLaser = highlightedPathIds.includes(link.source.id) && highlightedPathIds.includes(link.target.id);
          if (isLaser) return 'rgba(255, 255, 255, 0.8)';
          
          const isActive = 
            link.source.id === selectedNodeId || link.target.id === selectedNodeId ||
            link.source.id === hoverNode?.id || link.target.id === hoverNode?.id;
            
          return isActive ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.03)';
        }}
        linkWidth={(link: any) => {
          return (highlightedPathIds.includes(link.source.id) && highlightedPathIds.includes(link.target.id)) ? 2 : 0.5;
        }}
        linkDirectionalParticles={(link: any) => {
          // Trade routes: energy pulses travelling along links
          return Math.random() < 0.3 ? 1 : 0;
        }}
        linkDirectionalParticleWidth={1.5}
        linkDirectionalParticleSpeed={0.002}
        linkDirectionalParticleColor={() => 'rgba(255, 255, 255, 0.5)'}
        onNodeHover={(node) => setHoverNode(node)}
        onNodeClick={(node) => {
          onNodeClick(node);
          fgRef.current.centerAt(node.x, node.y, 1000);
          fgRef.current.zoom(3, 1000);
        }}
        d3VelocityDecay={0.3}
        cooldownTicks={100}
      />
    </div>
  );
};
