import { Link } from "@tanstack/react-router";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Calendar, Target } from "lucide-react";
import { resolveIpfs, FALLBACK_IMAGE } from "@/lib/ipfs";
import { IpfsStatusBadge } from "@/components/IpfsStatusBadge";

interface Props {
  project: {
    id: string;
    title: string;
    description: string;
    image_url: string | null;
    goal_amount: number;
    raised_amount: number;
    deadline: string;
    status: string;
    ipfs_image_status?: string | null;
    ipfs_description_status?: string | null;
  };
}

export function ProjectCard({ project }: Props) {
  const pct = Math.min(100, Math.round((Number(project.raised_amount) / Number(project.goal_amount)) * 100));
  const daysLeft = Math.max(0, Math.ceil((new Date(project.deadline).getTime() - Date.now()) / 86400000));

  return (
    <Link
      to="/projects/$projectId"
      params={{ projectId: project.id }}
      className="card-surface overflow-hidden hover:shadow-glow hover:-translate-y-1 transition-smooth flex flex-col group"
    >
      <div className="aspect-video bg-muted overflow-hidden relative">
        {project.image_url ? (
          <img
            src={resolveIpfs(project.image_url) ?? FALLBACK_IMAGE}
            alt={project.title}
            loading="lazy"
            onError={(e) => { (e.currentTarget as HTMLImageElement).src = FALLBACK_IMAGE; }}
            className="w-full h-full object-cover group-hover:scale-105 transition-smooth"
          />
        ) : (
          <div className="w-full h-full bg-gradient-primary opacity-30" />
        )}
        <Badge className="absolute top-3 right-3 bg-background/80 backdrop-blur text-foreground border border-border capitalize">
          {project.status}
        </Badge>
      </div>
      <div className="p-5 flex flex-col flex-1 gap-3">
        <h3 className="font-semibold text-lg leading-tight line-clamp-2">{project.title}</h3>
        <p className="text-sm text-muted-foreground line-clamp-2">{project.description}</p>
        {(project.ipfs_image_status || project.ipfs_description_status) && (
          <div className="flex flex-wrap gap-1">
            <IpfsStatusBadge label="Image" status={project.ipfs_image_status} />
            <IpfsStatusBadge label="Desc" status={project.ipfs_description_status} />
          </div>
        )}
        <div className="mt-auto space-y-3">
          <Progress value={pct} className="h-2" />
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-foreground">
              {Number(project.raised_amount).toLocaleString()} <span className="text-muted-foreground font-normal">/ {Number(project.goal_amount).toLocaleString()} ETH</span>
            </span>
            <span className="text-primary font-semibold">{pct}%</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {daysLeft}d left</span>
            <span className="flex items-center gap-1"><Target className="h-3 w-3" /> Goal {Number(project.goal_amount).toLocaleString()}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
