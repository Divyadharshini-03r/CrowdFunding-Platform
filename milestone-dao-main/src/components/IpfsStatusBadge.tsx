import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Minus } from "lucide-react";

interface Props {
  label: string;
  status: string | null | undefined;
}

export function IpfsStatusBadge({ label, status }: Props) {
  if (!status || status === "idle") return null;
  if (status === "skipped") {
    return (
      <Badge variant="outline" className="text-xs gap-1">
        <Minus className="h-3 w-3" /> {label}: none
      </Badge>
    );
  }
  if (status === "done") {
    return (
      <Badge className="text-xs gap-1 bg-success/20 text-success border-success/30">
        <CheckCircle2 className="h-3 w-3" /> {label}: pinned
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge variant="outline" className="text-xs gap-1 border-destructive/40 text-destructive">
        <XCircle className="h-3 w-3" /> {label}: failed
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs">
      {label}: {status}
    </Badge>
  );
}
