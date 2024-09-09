import { deepEqual, deepStrictEqual } from 'node:assert';
import { before, describe, test } from 'node:test';
import * as Misskey from 'misskey-js';
import { ADMIN_PARAMS, createAccount, fetchAdmin, type Request, resolveAdmin, uploadFile } from './utils.js';

const [
	[aAdmin, aAdminClient],
	[bAdmin, bAdminClient],
] = await Promise.all([
	fetchAdmin('a.local'),
	fetchAdmin('b.local'),
]);

describe('User', () => {
	describe('Profile', async () => {
		describe('Consistency of profile', async () => {
			const [alice] = await createAccount('a.local', aAdminClient);
			const [
				[, aliceWatcherC],
				[, aliceWatcherInBServerC],
			] = await Promise.all([
				createAccount('a.local', aAdminClient),
				createAccount('b.local', bAdminClient),
			]);

			const aliceInAServer = await (aliceWatcherC.request as Request)('users/show', { userId: alice.id });

			const resolved = await (async (): Promise<Misskey.entities.ApShowResponse & { type: 'User' }> => {
				const resolved = await (aliceWatcherInBServerC.request as Request)('ap/show', {
					uri: `https://a.local/@${aliceInAServer.username}`,
				});
				deepEqual(resolved.type, 'User');
				// @ts-expect-error we checked above assertion
				return resolved;
			})();

			const aliceInBServer = await (aliceWatcherInBServerC.request as Request)('users/show', { userId: resolved.object.id });

			console.log(`a.local: ${JSON.stringify(aliceInAServer, null, '\t')}`);
			console.log(`b.local: ${JSON.stringify(aliceInBServer, null, '\t')}`);

			const toBeDeleted: (keyof Misskey.entities.UserDetailedNotMe)[] = [
				'id',
				'host',
				'avatarUrl',
				'instance',
				'badgeRoles',
				'url',
				'uri',
				'createdAt',
				'lastFetchedAt',
				'publicReactions',
			];
			const _aliceInAServer: Partial<Misskey.entities.UserDetailedNotMe> = structuredClone(aliceInAServer);
			const _aliceInBServer: Partial<Misskey.entities.UserDetailedNotMe> = structuredClone(aliceInBServer);
			for (const alice of [_aliceInAServer, _aliceInBServer]) {
				for (const field of toBeDeleted) {
					delete alice[field];
				}
			}

			deepStrictEqual(_aliceInAServer, _aliceInBServer);
		});
	});

	describe('Follow / Unfollow', async () => {
		const [bAdminInAServer, aAdminInBServer] = await Promise.all([
			resolveAdmin('a.local', 'b.local', aAdminClient),
			resolveAdmin('b.local', 'a.local', bAdminClient),
		]);

		await describe('Follow @admin@a.local ==> @admin@b.local', async () => {
			before(async () => {
				console.log(`Following @${ADMIN_PARAMS.username}@b.local from @${ADMIN_PARAMS.username}@a.local ...`);
				await (aAdminClient.request as Request)('following/create', { userId: bAdminInAServer.object.id });
				console.log(`Followed @${ADMIN_PARAMS.username}@b.local from @${ADMIN_PARAMS.username}@a.local`);

				// wait for 1 secound
				await new Promise(resolve => setTimeout(resolve, 1000));
			});

			test('Check consistency with `users/following` and `users/followers` endpoints', async () => {
				await Promise.all([
					deepEqual(
						(await (aAdminClient.request as Request)('users/following', { userId: aAdmin.id }))
							.some(v => v.followeeId === bAdminInAServer.object.id),
						true,
					),
					deepEqual(
						(await (bAdminClient.request as Request)('users/followers', { userId: bAdmin.id }))
							.some(v => v.followerId === aAdminInBServer.object.id),
						true,
					),
				]);
			});
		});

		await describe('Unfollow @admin@a.local ==> @admin@b.local', async () => {
			before(async () => {
				console.log(`Unfollowing @${ADMIN_PARAMS.username}@b.local from @${ADMIN_PARAMS.username}@a.local ...`);
				await (aAdminClient.request as Request)('following/delete', { userId: bAdminInAServer.object.id });
				console.log(`Unfollowed @${ADMIN_PARAMS.username}@b.local from @${ADMIN_PARAMS.username}@a.local`);

				// wait for 1 secound
				await new Promise(resolve => setTimeout(resolve, 1000));
			});

			test('Check consistency with `users/following` and `users/followers` endpoints', async () => {
				await Promise.all([
					deepEqual(
						(await (aAdminClient.request as Request)('users/following', { userId: aAdmin.id }))
							.some(v => v.followeeId === bAdminInAServer.object.id),
						false,
					),
					deepEqual(
						(await (bAdminClient.request as Request)('users/followers', { userId: bAdmin.id }))
							.some(v => v.followerId === aAdminInBServer.object.id),
						false,
					),
				]);
			});
		});
	});
});

describe('Drive', () => {
	describe('Upload in a.local and resolve from b.local', async () => {
		const [uploader, uploaderClient] = await createAccount('a.local', aAdminClient);

		const whiteImage = await uploadFile('a.local', './assets/white.webp', uploader.i);
		const noteWithWhiteImage = (await (uploaderClient.request as Request)('notes/create', { fileIds: [whiteImage.id] })).createdNote;
		const uri = `https://a.local/notes/${noteWithWhiteImage.id}`;
		const noteInBServer = await (async (): Promise<Misskey.entities.ApShowResponse & { type: 'Note' }> => {
			const resolved = await (bAdminClient.request as Request)('ap/show', { uri });
			deepEqual(resolved.type, 'Note');
			// @ts-expect-error we checked above assertion
			return resolved;
		})();
		deepEqual(noteInBServer.object.uri, uri);
		deepEqual(noteInBServer.object.files != null, true);
		deepEqual(noteInBServer.object.files!.length, 1);
		const whiteImageInBServer = noteInBServer.object.files![0];

		await test('Check consistency of DriveFile', () => {
			console.log(`a.local: ${JSON.stringify(whiteImage, null, '\t')}`);
			console.log(`b.local: ${JSON.stringify(whiteImageInBServer, null, '\t')}`);

			const toBeDeleted: (keyof Misskey.entities.DriveFile)[] = [
				'id',
				'createdAt',
				'size',
				'url',
				'thumbnailUrl',
				'userId',
			];
			const _whiteImage: Partial<Misskey.entities.DriveFile> = structuredClone(whiteImage);
			const _whiteImageInBServer: Partial<Misskey.entities.DriveFile> = structuredClone(whiteImageInBServer);

			for (const image of [_whiteImage, _whiteImageInBServer]) {
				for (const field of toBeDeleted) {
					delete image[field];
				}
			}

			deepStrictEqual(_whiteImage, _whiteImageInBServer);
		});

		const updatedWhiteImage = await (uploaderClient.request as Request)('drive/files/update', {
			fileId: whiteImage.id,
			name: 'updated_white.webp',
			isSensitive: true,
		});

		const updatedWhiteImageInBServer = await (bAdminClient.request as Request)('drive/files/show', {
			fileId: whiteImageInBServer.id,
		});

		await test('Update', async () => {
			console.log(`a.local: ${JSON.stringify(updatedWhiteImage, null, '\t')}`);
			console.log(`b.local: ${JSON.stringify(updatedWhiteImageInBServer, null, '\t')}`);
			// FIXME: not updated with `drive/files/update`
			deepEqual(updatedWhiteImage.isSensitive, true);
			deepEqual(updatedWhiteImage.name, 'updated_white.webp');
			deepEqual(updatedWhiteImageInBServer.isSensitive, false);
			deepEqual(updatedWhiteImageInBServer.name, 'white.webp');
		});

		const noteWithUpdatedWhiteImage = (await (uploaderClient.request as Request)('notes/create', { fileIds: [updatedWhiteImage.id] })).createdNote;
		const uriUpdated = `https://a.local/notes/${noteWithUpdatedWhiteImage.id}`;
		const noteWithUpdatedWhiteImageInBServer = await (async (): Promise<Misskey.entities.ApShowResponse & { type: 'Note' }> => {
			const resolved = await (bAdminClient.request as Request)('ap/show', { uri: uriUpdated });
			deepEqual(resolved.type, 'Note');
			// @ts-expect-error we checked above assertion
			return resolved;
		})();
		deepEqual(noteWithUpdatedWhiteImageInBServer.object.uri, uriUpdated);
		deepEqual(noteWithUpdatedWhiteImageInBServer.object.files != null, true);
		deepEqual(noteWithUpdatedWhiteImageInBServer.object.files!.length, 1);
		const reupdatedWhiteImageInBServer = noteWithUpdatedWhiteImageInBServer.object.files![0];

		await test('Re-update with attaching to Note', async () => {
			console.log(`b.local: ${JSON.stringify(reupdatedWhiteImageInBServer, null, '\t')}`);
			// `isSensitive` is updated
			deepEqual(reupdatedWhiteImageInBServer.isSensitive, true);
			// FIXME: but `name` is not updated
			deepEqual(reupdatedWhiteImageInBServer.name, 'white.webp');
		});
	});
});
