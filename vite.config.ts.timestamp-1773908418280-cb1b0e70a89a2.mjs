// vite.config.ts
import { defineConfig } from "file:///C:/PRANAV/VS%20Code/Boostmysites/BMS/chartmate-trading-widget%20(tradingsmart.ai)/node_modules/vite/dist/node/index.js";
import react from "file:///C:/PRANAV/VS%20Code/Boostmysites/BMS/chartmate-trading-widget%20(tradingsmart.ai)/node_modules/@vitejs/plugin-react-swc/index.js";
import path from "path";
import { componentTagger } from "file:///C:/PRANAV/VS%20Code/Boostmysites/BMS/chartmate-trading-widget%20(tradingsmart.ai)/node_modules/lovable-tagger/dist/index.js";
var __vite_injected_original_dirname = "C:\\PRANAV\\VS Code\\Boostmysites\\BMS\\chartmate-trading-widget (tradingsmart.ai)";
var vite_config_default = defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080
  },
  assetsInclude: ["**/*.PNG", "**/*.png", "**/*.JPG", "**/*.JPEG", "**/*.GIF", "**/*.WEBP", "**/*.SVG"],
  plugins: [
    react(),
    mode === "development" && componentTagger()
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__vite_injected_original_dirname, "./src")
    }
  }
}));
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxQUkFOQVZcXFxcVlMgQ29kZVxcXFxCb29zdG15c2l0ZXNcXFxcQk1TXFxcXGNoYXJ0bWF0ZS10cmFkaW5nLXdpZGdldCAodHJhZGluZ3NtYXJ0LmFpKVwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiQzpcXFxcUFJBTkFWXFxcXFZTIENvZGVcXFxcQm9vc3RteXNpdGVzXFxcXEJNU1xcXFxjaGFydG1hdGUtdHJhZGluZy13aWRnZXQgKHRyYWRpbmdzbWFydC5haSlcXFxcdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL0M6L1BSQU5BVi9WUyUyMENvZGUvQm9vc3RteXNpdGVzL0JNUy9jaGFydG1hdGUtdHJhZGluZy13aWRnZXQlMjAodHJhZGluZ3NtYXJ0LmFpKS92aXRlLmNvbmZpZy50c1wiO2ltcG9ydCB7IGRlZmluZUNvbmZpZyB9IGZyb20gXCJ2aXRlXCI7XHJcbmltcG9ydCByZWFjdCBmcm9tIFwiQHZpdGVqcy9wbHVnaW4tcmVhY3Qtc3djXCI7XHJcbmltcG9ydCBwYXRoIGZyb20gXCJwYXRoXCI7XHJcbmltcG9ydCB7IGNvbXBvbmVudFRhZ2dlciB9IGZyb20gXCJsb3ZhYmxlLXRhZ2dlclwiO1xyXG5cclxuLy8gaHR0cHM6Ly92aXRlanMuZGV2L2NvbmZpZy9cclxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKCh7IG1vZGUgfSkgPT4gKHtcclxuICBzZXJ2ZXI6IHtcclxuICAgIGhvc3Q6IFwiOjpcIixcclxuICAgIHBvcnQ6IDgwODAsXHJcbiAgfSxcclxuICBhc3NldHNJbmNsdWRlOiBbXCIqKi8qLlBOR1wiLCBcIioqLyoucG5nXCIsIFwiKiovKi5KUEdcIiwgXCIqKi8qLkpQRUdcIiwgXCIqKi8qLkdJRlwiLCBcIioqLyouV0VCUFwiLCBcIioqLyouU1ZHXCJdLFxyXG4gIHBsdWdpbnM6IFtcclxuICAgIHJlYWN0KCksXHJcbiAgICBtb2RlID09PSAnZGV2ZWxvcG1lbnQnICYmXHJcbiAgICBjb21wb25lbnRUYWdnZXIoKSxcclxuICBdLmZpbHRlcihCb29sZWFuKSxcclxuICByZXNvbHZlOiB7XHJcbiAgICBhbGlhczoge1xyXG4gICAgICBcIkBcIjogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgXCIuL3NyY1wiKSxcclxuICAgIH0sXHJcbiAgfSxcclxufSkpO1xyXG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQXlhLFNBQVMsb0JBQW9CO0FBQ3RjLE9BQU8sV0FBVztBQUNsQixPQUFPLFVBQVU7QUFDakIsU0FBUyx1QkFBdUI7QUFIaEMsSUFBTSxtQ0FBbUM7QUFNekMsSUFBTyxzQkFBUSxhQUFhLENBQUMsRUFBRSxLQUFLLE9BQU87QUFBQSxFQUN6QyxRQUFRO0FBQUEsSUFDTixNQUFNO0FBQUEsSUFDTixNQUFNO0FBQUEsRUFDUjtBQUFBLEVBQ0EsZUFBZSxDQUFDLFlBQVksWUFBWSxZQUFZLGFBQWEsWUFBWSxhQUFhLFVBQVU7QUFBQSxFQUNwRyxTQUFTO0FBQUEsSUFDUCxNQUFNO0FBQUEsSUFDTixTQUFTLGlCQUNULGdCQUFnQjtBQUFBLEVBQ2xCLEVBQUUsT0FBTyxPQUFPO0FBQUEsRUFDaEIsU0FBUztBQUFBLElBQ1AsT0FBTztBQUFBLE1BQ0wsS0FBSyxLQUFLLFFBQVEsa0NBQVcsT0FBTztBQUFBLElBQ3RDO0FBQUEsRUFDRjtBQUNGLEVBQUU7IiwKICAibmFtZXMiOiBbXQp9Cg==
