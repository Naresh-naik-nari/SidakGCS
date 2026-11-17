<script lang="ts">
    import { primaryColorStore, secondaryColorStore } from '../../stores/customizationStore';
    $: primaryColor = $primaryColorStore;
    $: secondaryColor = $secondaryColorStore;
  </script>

<div class="dashboard-container h-full w-full flex items-stretch justify-center p-0">
    <div class="dashboard w-full grid grid-cols-12 grid-rows-6 gap-4 p-5 rounded-[20px] overflow-auto h-full max-h-full"
        style="--secondaryColor: {secondaryColor}"
    >
        <div class="notification-settings col-span-12 row-span-6 rounded-2xl h-full" style="--primaryColor: {primaryColor}">
            <!-- <NotificationSettings /> -->
        </div>
    </div>
</div>

<style>
    .dashboard {
      background-color: var(--secondaryColor);
    }
  
    .notification-settings {
        background: var(--primaryColor);
    }
</style>