export function AgentIcon({ id, size = 20 }: { id: string; size?: number }) {
  return (
    <span className="ai-agent-icon" style={{ width: size, height: size }} aria-hidden="true">
      <img src={`/agents/${id}.svg`} alt="" width={size} height={size} />
    </span>
  );
}
