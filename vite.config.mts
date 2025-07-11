import { defineConfig } from "vite";
import path from "path";
import plugins from "./.build/plugins";

// https://vite.dev/config/
export default defineConfig((cnf) => {
  return {
    base: './',
    plugins: plugins(cnf),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    css: {
      // css全局变量使用，@/styles/variable.scss文件
      preprocessorOptions: {
        scss: {
          additionalData: '@use "@/styles/var.scss" as *;',
        },
      },
    },
  };
});
