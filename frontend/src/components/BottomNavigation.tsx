import { Search, ArrowLeftRight } from "lucide-react";
import { Button } from "./ui/button";

interface BottomNavigationProps {
  activeTab: "discover" | "interpolate";
  onTabChange: (tab: "discover" | "interpolate") => void;
}

export const BottomNavigation = ({ activeTab, onTabChange }: BottomNavigationProps) => {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-card border-t-2 border-foreground p-4">
      <div className="flex justify-center gap-8">
        <Button
          onClick={() => onTabChange("discover")}
          variant={activeTab === "discover" ? "default" : "outline"}
          className={`
            flex items-center gap-2 px-6 py-3 font-retro border-2 border-foreground shadow-retro
            ${activeTab === "discover" 
              ? "bg-accent text-accent-foreground hover:bg-accent" 
              : "bg-card text-foreground hover:bg-secondary"
            }
          `}
        >
          <Search className="h-4 w-4" />
          DISCOVER
        </Button>
        
        <Button
          onClick={() => onTabChange("interpolate")}
          variant={activeTab === "interpolate" ? "default" : "outline"}
          className={`
            flex items-center gap-2 px-6 py-3 font-retro border-2 border-foreground shadow-retro
            ${activeTab === "interpolate" 
              ? "bg-accent text-accent-foreground hover:bg-accent" 
              : "bg-card text-foreground hover:bg-secondary"
            }
          `}
        >
          <ArrowLeftRight className="h-4 w-4" />
          INTERPOLATE
        </Button>
      </div>
    </div>
  );
};