import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardLayout } from "@/components/DashboardLayout";
import { KnowledgeBase } from "@/components/knowledge/KnowledgeBase";
import { TrainingMemory } from "@/components/knowledge/TrainingMemory";

const KnowledgePage = () => {
  const [activeTab, setActiveTab] = useState("knowledge");

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-6 animate-slide-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Knowledge & Training</h1>
          <p className="text-muted-foreground text-sm">
            Upload content to make your AI smarter and train it on your conversation style
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-muted border border-border">
            <TabsTrigger value="knowledge" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
              📚 Knowledge Base
            </TabsTrigger>
            <TabsTrigger value="training" className="data-[state=active]:bg-secondary/10 data-[state=active]:text-secondary">
              🧠 Training Memory
            </TabsTrigger>
          </TabsList>

          <TabsContent value="knowledge">
            <KnowledgeBase />
          </TabsContent>
          <TabsContent value="training">
            <TrainingMemory />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default KnowledgePage;
