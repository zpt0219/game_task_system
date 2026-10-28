import './style.css';
import { TaskStudioApp } from './app/app';

declare global {
  interface Window {
    __taskStudio?: TaskStudioApp;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const app = new TaskStudioApp();
  if (new URLSearchParams(window.location.search).has('debug')) {
    window.__taskStudio = app;
  }
  void app.init();
});
