import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ProjectCard } from "@/components/ProjectCard";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles } from "lucide-react";

import fundingImg from "@/assets/feature-funding.jpg";
import milestonesImg from "@/assets/feature-milestones.jpg";
import refundImg from "@/assets/feature-refund.jpg";

export const Route = createFileRoute("/")({
  component: Home,
});

interface Project {
  id: string;
  title: string;
  description: string;
  image_url: string | null;
  goal_amount: number;
  raised_amount: number;
  deadline: string;
  status: string;
  ipfs_image_status: string | null;
  ipfs_description_status: string | null;
}

function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(12)
      .then(({ data }) => {
        setProjects((data as Project[]) ?? []);
        setLoading(false);
      });
  }, []);

  return (
    <main>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-primary blur-3xl opacity-20 pointer-events-none" />
        <div className="container relative mx-auto px-4 pt-20 pb-24 max-w-3xl text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-card/50 backdrop-blur text-xs">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="text-muted-foreground">DAO-governed milestone funding</span>
          </div>
          <h1 className="text-5xl md:text-6xl font-bold leading-[1.05] tracking-tight">
            Fund ideas. <br />
            <span className="text-gradient">Backed by the crowd.</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            A trustless crowdfunding platform where backers vote to release funds milestone by milestone.
            No middlemen. No blind trust.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Button asChild size="lg" className="bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-glow">
              <Link to="/auth">Start Funding <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#projects">Explore Projects</a>
            </Button>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="container mx-auto px-4 py-16">
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { img: fundingImg, title: "Fund a project", desc: "Discover ideas you believe in and contribute to their funding goal." },
            { img: milestonesImg, title: "Vote on milestones", desc: "Backers decide when funds get released as creators hit their goals." },
            { img: refundImg, title: "Refund if it fails", desc: "If a project misses its targets, the community can vote for refunds." },
          ].map((f) => (
            <div key={f.title} className="card-surface overflow-hidden hover:shadow-glow transition-smooth">
              <img src={f.img} alt={f.title} loading="lazy" width={1024} height={768} className="w-full aspect-[4/3] object-cover" />
              <div className="p-6">
                <h3 className="font-semibold text-lg mb-1">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Projects */}
      <section id="projects" className="container mx-auto px-4 py-16">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Live projects</h2>
            <p className="text-muted-foreground mt-1">Back the ideas shaping tomorrow.</p>
          </div>
        </div>

        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="card-surface aspect-[4/5] animate-pulse" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="card-surface p-12 text-center">
            <p className="text-muted-foreground mb-4">No projects yet. Be the first to launch one.</p>
            <Button asChild className="bg-gradient-primary text-primary-foreground">
              <Link to="/projects/new">Create a project</Link>
            </Button>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        )}
      </section>

      <footer className="border-t border-border mt-20">
        <div className="container mx-auto px-4 py-8 text-sm text-muted-foreground text-center">
          Built on FundDAO — decentralized crowdfunding for everyone.
        </div>
      </footer>
    </main>
  );
}
