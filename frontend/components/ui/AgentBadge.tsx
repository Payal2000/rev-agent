import { agentColor, agentLabel } from "@/lib/utils";

interface Props {
  agent: string;
  size?: "sm" | "md";
}

export default function AgentBadge({ agent, size = "sm" }: Props) {
  const color = agentColor(agent);
  const label = agentLabel(agent);
  const isSmall = size === "sm";

  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: isSmall ? 4 : 5,
      padding: isSmall ? "2px 8px" : "3px 10px",
      borderRadius: 999,
      fontSize: isSmall ? 10.5 : 12,
      fontWeight: 600,
      background: `${color}1A`,
      color,
      border: `1px solid ${color}33`,
      letterSpacing: "0.01em",
      whiteSpace: "nowrap",
    }}>
      <span style={{
        width: isSmall ? 5 : 6,
        height: isSmall ? 5 : 6,
        borderRadius: "50%",
        background: color,
        flexShrink: 0,
      }} />
      {label}
    </span>
  );
}
