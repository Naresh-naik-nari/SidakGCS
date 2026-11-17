import { writable } from 'svelte/store';

/** Controls visibility of the Flight Logbook panel on the cockpit/dashboard page. */
export const logbookOpenStore = writable<boolean>(false);
