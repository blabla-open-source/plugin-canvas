export interface BlablaHostPrepareDestroyInput {
	action: "discard" | "preserve" | "save";
	revision: number;
	reason:
		| "app-quit"
		| "cache-evict"
		| "library-switch"
		| "plugin-disable"
		| "plugin-update"
		| "tab-close"
		| "window-close";
}

export interface BlablaHostPrepareDestroyResult {
	failure?: "backup-failed" | "conflict" | "save-failed";
	revision: number;
	status: "blocked" | "clean" | "recovered" | "saved";
}

export interface BlablaHostLifecycleApi<TContext> {
	onPrepareDestroy(
		handler: (
			input: BlablaHostPrepareDestroyInput,
		) =>
			| BlablaHostPrepareDestroyResult
			| Promise<BlablaHostPrepareDestroyResult>,
	): { dispose(): void };
	ready(input: {
		saveMode: "autosave" | "explicit";
		title: string;
	}): Promise<TContext>;
}

export interface BlablaHostSurfaceStateApi {
	setDirty(input: {
		dirty: boolean;
		revision: number;
	}): Promise<{ dirty: boolean; revision: number }>;
}
