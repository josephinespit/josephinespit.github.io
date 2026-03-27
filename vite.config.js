import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [svelte()],
  // Replace 'repo-name' with your actual GitHub repository name
  base: '/initiatievenkaart/', 
})