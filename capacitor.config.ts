import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.cclauctions.app",
  appName: "CCL Auctions",
  webDir: "out",
  server: {
    androidScheme: "https",
  },
};

export default config;
