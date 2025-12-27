import Header from "./components/Header";
import DevTools from "./components/DevTools";
import MarketHeader from "./components/MarketHeader";
import PriceChart from "./components/PriceChart";
import OrderBook from "./components/OrderBook";
import TradingPanel from "./components/TradingPanel";
import RelatedMarkets from "./components/RelatedMarkets";
import MarketContext from "./components/MarketContext";
import Rules from "./components/Rules";
import CommentsSection from "./components/CommentsSection";

export default function Home() {
  return (
    <div className="min-h-screen bg-black">
      <Header />
      <div className="mx-auto max-w-7xl px-3 py-4 sm:px-4 sm:py-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
          {/* Main Content Area */}
          <div className="lg:col-span-2">
            <MarketHeader />
            <PriceChart />
            <OrderBook />
            <MarketContext />
            <Rules />
            <CommentsSection />
          </div>

          {/* Right Sidebar */}
          <div className="lg:col-span-1">
            <TradingPanel />
            <RelatedMarkets />
          </div>
        </div>
      </div>
      <DevTools />
    </div>
  );
}
