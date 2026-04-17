import React, { useState, useEffect, useCallback, useRef } from 'react';

const EDGE_COLORS = { ip: '#00ccff', device: '#00ff88', payment: '#ff8800', bank: '#9b59b6', kyc: '#ff4444' };
const EDGE_LABELS = { ip: 'Shared IP', device: 'Shared Device', payment: 'Shared Payment', bank: 'Shared Bank', kyc: 'Shared KYC Document' };

// Simple circle layout for nodes
const layoutNodes = (nodes, width, height) => {
    const cx = width / 2;
    const cy = height / 2;
    const r = Math.min(width, height) * 0.38;
    return nodes.map((node, i) => ({
        ...node,
        x: cx + r * Math.cos((2 * Math.PI * i) / nodes.length - Math.PI / 2),
        y: cy + r * Math.sin((2 * Math.PI * i) / nodes.length - Math.PI / 2),
    }));
};

export const CollusionGraph = ({ token, user }) => {
    const [graphData, setGraphData] = useState({ nodes: [], edges: [] });
    const [loading, setLoading] = useState(true);
    const [visibleEdgeTypes, setVisibleEdgeTypes] = useState(Object.keys(EDGE_COLORS));
    const [selectedNode, setSelectedNode] = useState(null);
    const [tooltip, setTooltip] = useState(null);
    const svgRef = useRef(null);
    const [dimensions, setDimensions] = useState({ width: 700, height: 480 });

    const fetchGraph = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/operator/fraud/collusion-graph', { headers: { 'Authorization': `Bearer ${token}` } });
            const data = await res.json();
            setGraphData(data);
        } catch (_) {} finally { setLoading(false); }
    }, [token]);

    useEffect(() => { fetchGraph(); }, [fetchGraph]);

    useEffect(() => {
        if (svgRef.current) {
            const { clientWidth, clientHeight } = svgRef.current.parentElement;
            setDimensions({ width: clientWidth || 700, height: Math.max(440, clientHeight || 480) });
        }
    }, []);

    const { nodes: rawNodes, edges } = graphData;
    const nodes = layoutNodes(rawNodes, dimensions.width, dimensions.height);
    const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]));

    const visibleEdges = edges.filter(e => visibleEdgeTypes.includes(e.type));

    const handleNodeClick = (node) => {
        setSelectedNode(selectedNode?.id === node.id ? null : node);
    };

    const connectedNodeIds = selectedNode
        ? new Set(edges.filter(e => e.source === selectedNode.id || e.target === selectedNode.id).flatMap(e => [e.source, e.target]))
        : null;

    return (
        <div style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                    <h2 style={{ color: '#fff', fontSize: '20px', fontWeight: '700', margin: '0 0 4px' }}>Collusion Graph</h2>
                    <p style={{ color: '#888', fontSize: '13px', margin: 0 }}>{rawNodes.length} accounts · {edges.length} connections</p>
                </div>
                <button onClick={fetchGraph} style={{ background: 'rgba(0,204,255,0.1)', border: '1px solid rgba(0,204,255,0.25)', borderRadius: '6px', padding: '7px 14px', color: '#00ccff', cursor: 'pointer', fontSize: '13px' }}>
                    Refresh
                </button>
            </div>

            {/* Edge type toggles */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                {Object.entries(EDGE_COLORS).map(([type, color]) => {
                    const active = visibleEdgeTypes.includes(type);
                    const count = edges.filter(e => e.type === type).length;
                    return (
                        <button
                            key={type}
                            onClick={() => setVisibleEdgeTypes(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type])}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 12px', borderRadius: '6px', cursor: 'pointer',
                                border: `1px solid ${active ? color : 'rgba(255,255,255,0.08)'}`,
                                background: active ? `${color}22` : 'transparent',
                                color: active ? color : '#555', fontSize: '12px', transition: 'all 0.15s'
                            }}
                        >
                            <div style={{ width: '10px', height: '2px', background: active ? color : '#333', borderRadius: '1px' }} />
                            {EDGE_LABELS[type]} ({count})
                        </button>
                    );
                })}
            </div>

            {loading ? (
                <div style={{ color: '#888', textAlign: 'center', padding: '60px', background: 'rgba(255,255,255,0.02)', borderRadius: '10px' }}>
                    Loading graph data...
                </div>
            ) : rawNodes.length === 0 ? (
                <div style={{ color: '#666', textAlign: 'center', padding: '60px', background: 'rgba(255,255,255,0.02)', borderRadius: '10px' }}>
                    No collusion patterns detected
                </div>
            ) : (
                <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden', position: 'relative' }}>
                    <svg ref={svgRef} width="100%" height={dimensions.height} style={{ display: 'block' }}>
                        {/* Edges */}
                        {visibleEdges.map((edge, i) => {
                            const s = nodeMap[edge.source];
                            const t = nodeMap[edge.target];
                            if (!s || !t) return null;
                            const color = EDGE_COLORS[edge.type] || '#888';
                            return (
                                <line
                                    key={i}
                                    x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                                    stroke={color}
                                    strokeWidth={1.5}
                                    strokeOpacity={selectedNode ? (edge.source === selectedNode.id || edge.target === selectedNode.id ? 0.9 : 0.15) : 0.35}
                                    onMouseEnter={(e) => setTooltip({ x: e.clientX, y: e.clientY, text: `${EDGE_LABELS[edge.type]}: ${edge.evidence || edge.value || ''}` })}
                                    onMouseLeave={() => setTooltip(null)}
                                    style={{ cursor: 'pointer' }}
                                />
                            );
                        })}

                        {/* Nodes */}
                        {nodes.map(node => {
                            const isSelected = selectedNode?.id === node.id;
                            const isConnected = connectedNodeIds ? connectedNodeIds.has(node.id) : false;
                            const dim = selectedNode && !isSelected && !isConnected;
                            return (
                                <g key={node.id} onClick={() => handleNodeClick(node)} style={{ cursor: 'pointer' }}>
                                    <circle
                                        cx={node.x} cy={node.y} r={isSelected ? 18 : 13}
                                        fill={isSelected ? '#00ccff' : '#1a1a2e'}
                                        stroke={isSelected ? '#00ccff' : isConnected ? '#ffd700' : 'rgba(255,255,255,0.15)'}
                                        strokeWidth={isSelected ? 3 : isConnected ? 2 : 1}
                                        opacity={dim ? 0.3 : 1}
                                        style={{ transition: 'all 0.2s' }}
                                    />
                                    <text
                                        x={node.x} y={node.y + 4}
                                        textAnchor="middle"
                                        fill={isSelected ? '#000' : '#aaa'}
                                        fontSize={9}
                                        fontFamily="monospace"
                                        opacity={dim ? 0.3 : 1}
                                    >
                                        {String(node.id).slice(0, 6)}
                                    </text>
                                </g>
                            );
                        })}
                    </svg>

                    {/* Tooltip */}
                    {tooltip && (
                        <div style={{
                            position: 'fixed', left: tooltip.x + 10, top: tooltip.y - 10,
                            background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.15)',
                            borderRadius: '6px', padding: '6px 10px', color: '#fff', fontSize: '12px',
                            pointerEvents: 'none', zIndex: 9999, maxWidth: '200px'
                        }}>
                            {tooltip.text}
                        </div>
                    )}
                </div>
            )}

            {/* Selected node info */}
            {selectedNode && (
                <div style={{ marginTop: '16px', background: 'rgba(0,204,255,0.05)', border: '1px solid rgba(0,204,255,0.2)', borderRadius: '8px', padding: '14px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ color: '#00ccff', fontWeight: '700', marginBottom: '4px' }}>Player {selectedNode.id}</div>
                            <div style={{ color: '#888', fontSize: '12px' }}>
                                {edges.filter(e => e.source === selectedNode.id || e.target === selectedNode.id).length} connections
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            {[['Suspend', '#ff4444'], ['Freeze Withdrawals', '#ff8800'], ['Flag for Review', '#ffd700']].map(([label, color]) => (
                                <button key={label}
                                    style={{ padding: '6px 12px', background: `${color}22`, border: `1px solid ${color}44`, borderRadius: '5px', color, cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CollusionGraph;
