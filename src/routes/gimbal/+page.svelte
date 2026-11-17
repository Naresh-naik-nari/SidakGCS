<script lang="ts">
  import LiveFeed from '../../components/LiveFeed.svelte';
  import { secondaryColorStore } from '../../stores/customizationStore';

  $: secondaryColor = $secondaryColorStore;
</script>

<svelte:head>
  <title>Video — GCS</title>
</svelte:head>

<div class="video-page-container h-full w-full flex items-stretch justify-center p-0">
  <div
    class="video-page w-full p-5 rounded-[20px] overflow-auto h-full max-h-full"
    style="--secondaryColor: {secondaryColor}"
  >
    <div class="live-feed h-full">
      <LiveFeed />
    </div>
  </div>
</div>

<style>
  .video-page-container {
    background: #111827;
  }

  .video-page {
    background-color: var(--secondaryColor);
  }

  .live-feed {
    border-radius: 1rem;
    overflow: hidden;
  }

  @media (max-width: 990px) {
    .video-page-container {
      min-height: fit-content;
      max-height: fit-content;
    }

    .video-page {
      display: flex;
      flex-direction: column;
      padding: 0.7em;
      height: 100%;
      max-height: 100%;
      border-radius: 0;
      overflow: auto;
      padding-bottom: 5em;
    }

    .live-feed {
      min-height: 400px;
      flex: 1;
    }
  }
</style>
