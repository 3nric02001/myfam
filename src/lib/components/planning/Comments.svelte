<script lang="ts">
	import { MessageCircle, Pencil, SendHorizontal, Trash2 } from '@lucide/svelte';
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';

	// Comments under a planning card. Posts to the card page's comment actions.
	type Comment = {
		id: string;
		text: string;
		author: string | null;
		createdAt: Date;
		editedAt: Date | null;
		isOwn: boolean;
	};

	let {
		comments,
		error = null,
		errorFor = null
	}: {
		comments: Comment[];
		/** Message of the last failed comment action. */
		error?: string | null;
		/** The comment the error belongs to, or null for the new-comment form. */
		errorFor?: string | null;
	} = $props();

	let editingId = $state<string | null>(null);

	const time = new Intl.DateTimeFormat('de-DE', {
		day: 'numeric',
		month: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});
	const timeWithYear = new Intl.DateTimeFormat('de-DE', {
		dateStyle: 'short',
		timeStyle: 'short'
	});
	const when = (d: Date) =>
		(d.getFullYear() === new Date().getFullYear() ? time : timeWithYear).format(d);

	const afterSave: SubmitFunction =
		() =>
		async ({ result, update }) => {
			await update({ reset: result.type === 'success' });
			if (result.type === 'success') editingId = null;
		};
</script>

<section class="mt-8" aria-labelledby="comments-title">
	<h2 id="comments-title" class="mb-3 flex items-center gap-2 font-semibold">
		<MessageCircle size={18} aria-hidden="true" class="text-slate-500" />
		Kommentare
		{#if comments.length}<span class="text-sm font-normal text-slate-500">{comments.length}</span
			>{/if}
	</h2>

	{#if comments.length}
		<ul class="mb-3 space-y-2">
			{#each comments as comment (comment.id)}
				<li
					id="kommentar-{comment.id}"
					class="scroll-mt-20 rounded-2xl px-4 py-3 {comment.isOwn
						? 'bg-brand-50'
						: 'border border-slate-200 bg-surface'}"
				>
					<div class="flex items-center gap-2 text-xs text-slate-500">
						<span class="font-semibold text-slate-700"
							>{comment.author ?? 'Ehemaliges Mitglied'}</span
						>
						<time datetime={comment.createdAt.toISOString()}>{when(comment.createdAt)}</time>
						{#if comment.editedAt}<span>· bearbeitet</span>{/if}
						{#if comment.isOwn && editingId !== comment.id}
							<span class="ml-auto flex">
								<button
									class="icon-btn size-8"
									onclick={() => (editingId = comment.id)}
									aria-label="Kommentar bearbeiten"><Pencil size={14} aria-hidden="true" /></button
								>
								<form
									method="POST"
									action="?/deleteComment"
									use:enhance={({ cancel }) => {
										if (!confirm('Diesen Kommentar löschen?')) cancel();
									}}
								>
									<input type="hidden" name="commentId" value={comment.id} />
									<button class="icon-btn size-8" aria-label="Kommentar löschen"
										><Trash2 size={14} aria-hidden="true" /></button
									>
								</form>
							</span>
						{/if}
					</div>

					{#if editingId === comment.id}
						<form
							method="POST"
							action="?/editComment"
							use:enhance={afterSave}
							class="mt-2 space-y-2"
						>
							<input type="hidden" name="commentId" value={comment.id} />
							<!-- svelte-ignore a11y_autofocus -->
							<textarea
								name="text"
								rows="3"
								maxlength="2000"
								required
								autofocus
								class="w-full"
								aria-label="Kommentar"
								value={comment.text}></textarea>
							{#if error && errorFor === comment.id}<p class="error">{error}</p>{/if}
							<div class="flex gap-2">
								<button class="btn-primary flex-1">Speichern</button>
								<button type="button" class="btn-secondary" onclick={() => (editingId = null)}>
									Abbrechen
								</button>
							</div>
						</form>
					{:else}
						<p class="mt-1 break-words whitespace-pre-line">{comment.text}</p>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	<form method="POST" action="?/comment" use:enhance={afterSave} class="flex items-end gap-2">
		<textarea
			name="text"
			rows="2"
			maxlength="2000"
			required
			class="flex-1"
			aria-label="Neuer Kommentar"
			placeholder={comments.length ? 'Antworten …' : 'Kommentar schreiben …'}></textarea>
		<button class="btn-primary px-3" aria-label="Kommentar senden"
			><SendHorizontal size={18} aria-hidden="true" /></button
		>
	</form>
	{#if error && errorFor === null}<p class="error mt-2">{error}</p>{/if}
</section>
