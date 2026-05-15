import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { Wallet, Sparkles, LogOut, LayoutDashboard, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { connectWallet, shortAddress } from "@/lib/wallet";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function Header() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [wallet, setWallet] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setWallet(null);
      return;
    }
    supabase
      .from("profiles")
      .select("wallet_address")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setWallet(data?.wallet_address ?? null));
  }, [user]);

  const handleConnect = async () => {
    try {
      const addr = await connectWallet();
      if (!addr) return;
      if (user) {
        await supabase.from("profiles").update({ wallet_address: addr }).eq("id", user.id);
      }
      setWallet(addr);
      toast.success("Wallet connected", { description: shortAddress(addr) });
    } catch (e) {
      toast.error("Failed to connect wallet");
    }
  };

  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-background/70 border-b border-border">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="h-9 w-9 rounded-lg bg-gradient-primary flex items-center justify-center shadow-glow group-hover:scale-110 transition-smooth">
            <Sparkles className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-bold text-lg tracking-tight">
            Fund<span className="text-gradient">DAO</span>
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-sm">
          <Link to="/" className="text-muted-foreground hover:text-foreground transition-smooth" activeProps={{ className: "text-foreground" }}>
            Explore
          </Link>
          {user && (
            <Link to="/dashboard" className="text-muted-foreground hover:text-foreground transition-smooth" activeProps={{ className: "text-foreground" }}>
              Dashboard
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleConnect} className="gap-2">
            <Wallet className="h-4 w-4" />
            <span className="hidden sm:inline">{wallet ? shortAddress(wallet) : "Connect"}</span>
          </Button>
          {user ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/projects/new" })} className="gap-2">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">New</span>
              </Button>
              <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/dashboard" })} className="md:hidden">
                <LayoutDashboard className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await signOut();
                  navigate({ to: "/" });
                }}
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={() => navigate({ to: "/auth" })} className="bg-gradient-primary text-primary-foreground hover:opacity-90">
              Sign In
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
