import { AnnouncementBar } from "../../components/marketing/AnnouncementBar";
import { MarketingHeader } from "../../components/marketing/MarketingHeader";
import { RecordingStudio } from "../../components/recording/RecordingStudio";

export default function RecordPage() {
  return (
    <main className="marketing-page">
      <AnnouncementBar />
      <MarketingHeader />
      <RecordingStudio />
    </main>
  );
}
