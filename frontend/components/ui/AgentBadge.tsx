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
      padding: isSmall ? "2px 7px" : "3px 9px",
      borderRadius: 20,
      fontSize: isSmall ? 10.5 : 12,
      fontWeight: 600,
      background: `${color}18`,
      color: color,
      border: `1px solid ${color}30`,
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
