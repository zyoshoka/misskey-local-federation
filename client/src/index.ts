import { deepEqual, deepStrictEqual } from 'node:assert';
import { before, describe, test } from 'node:test';
import * as Misskey from 'misskey-js';
import { ADMIN_PARAMS, fetchAdmin, type Request, resolveAdmin, signin, uploadFile } from './utils.js';

const [
	[oneAdmin, oneAdminClient],
	[twoAdmin, twoAdminClient],
] = await Promise.all([
	fetchAdmin('one.local'),
	fetchAdmin('two.local'),
]);

const [twoAdminInOneServer, oneAdminInTwoServer] = await Promise.all([
	resolveAdmin('one.local', 'two.local', oneAdminClient),
	resolveAdmin('two.local', 'one.local', twoAdminClient),
]);

describe('Follow / Unfollow', async () => {
	await describe('Follow @admin@one.local ==> @admin@two.local', async () => {
		before(async () => {
			console.log(`Following @${ADMIN_PARAMS.username}@two.local from @${ADMIN_PARAMS.username}@one.local ...`);
			await (oneAdminClient.request as Request)('following/create', { userId: twoAdminInOneServer.object.id });
			console.log(`Followed @${ADMIN_PARAMS.username}@two.local from @${ADMIN_PARAMS.username}@one.local`);

			// wait for 1 secound
			await new Promise(resolve => setTimeout(resolve, 1000));
		});

		test('Check consistency with `users/following` and `users/followers` endpoints', async () => {
			await Promise.all([
				deepEqual(
					(await (oneAdminClient.request as Request)('users/following', { userId: oneAdmin.id }))
						.some(v => v.followeeId === twoAdminInOneServer.object.id),
					true,
				),
				deepEqual(
					(await (twoAdminClient.request as Request)('users/followers', { userId: twoAdmin.id }))
						.some(v => v.followerId === oneAdminInTwoServer.object.id),
					true,
				),
			]);
		});
	});

	await describe('Unfollow @admin@one.local ==> @admin@two.local', async () => {
		before(async () => {
			console.log(`Unfollowing @${ADMIN_PARAMS.username}@two.local from @${ADMIN_PARAMS.username}@one.local ...`);
			await (oneAdminClient.request as Request)('following/delete', { userId: twoAdminInOneServer.object.id });
			console.log(`Unfollowed @${ADMIN_PARAMS.username}@two.local from @${ADMIN_PARAMS.username}@one.local`);

			// wait for 1 secound
			await new Promise(resolve => setTimeout(resolve, 1000));
		});

		test('Check consistency with `users/following` and `users/followers` endpoints', async () => {
			await Promise.all([
				deepEqual(
					(await (oneAdminClient.request as Request)('users/following', { userId: oneAdmin.id }))
						.some(v => v.followeeId === twoAdminInOneServer.object.id),
					false,
				),
				deepEqual(
					(await (twoAdminClient.request as Request)('users/followers', { userId: twoAdmin.id }))
						.some(v => v.followerId === oneAdminInTwoServer.object.id),
					false,
				),
			]);
		});
	});
});

describe('Drive', () => {
	describe('Upload in one.local and resolve from two.local', async () => {
		const username = crypto.randomUUID().replaceAll('-', '').substring(0, 20);
		const password = crypto.randomUUID().replaceAll('-', '');
		await (oneAdminClient.request as Request)('admin/accounts/create', { username, password });
		console.log(`Created an account: @${username}@one.local`);

		const uploader = await signin('one.local', { username, password });
		const uploaderClient = new Misskey.api.APIClient({ origin: 'https://one.local', credential: uploader.i });

		const whiteImage = await uploadFile('one.local', './assets/white.webp', uploader.i);
		const noteWithWhiteImage = (await (uploaderClient.request as Request)('notes/create', { fileIds: [whiteImage.id] })).createdNote;
		const uri = `https://one.local/notes/${noteWithWhiteImage.id}`;
		const noteInTwoServer = await (async (): Promise<Misskey.entities.ApShowResponse & { type: 'Note' }> => {
			const resolved = await (twoAdminClient.request as Request)('ap/show', { uri });
			deepEqual(resolved.type, 'Note');
			// @ts-expect-error we checked above assertion
			return resolved;
		})();
		deepEqual(noteInTwoServer.object.uri, uri);
		deepEqual(noteInTwoServer.object.files != null, true);
		deepEqual(noteInTwoServer.object.files!.length, 1);
		const whiteImageInTwoServer = noteInTwoServer.object.files![0];

		await test('Check consistency of DriveFile', () => {
			console.log(`one.local: ${JSON.stringify(whiteImage, null, '\t')}`);
			console.log(`two.local: ${JSON.stringify(whiteImageInTwoServer, null, '\t')}`);

			const toBeDeleted: (keyof Misskey.entities.DriveFile)[] = [
				'id',
				'createdAt',
				'size',
				'url',
				'thumbnailUrl',
				'userId',
			];
			const _whiteImage: Partial<Misskey.entities.DriveFile> = structuredClone(whiteImage);
			const _whiteImageInTwoServer: Partial<Misskey.entities.DriveFile> = structuredClone(whiteImageInTwoServer);

			for (const image of [_whiteImage, _whiteImageInTwoServer]) {
				for (const field of toBeDeleted) {
					delete image[field];
				}
			}

			deepStrictEqual(_whiteImage, _whiteImageInTwoServer);
		});

		const updatedWhiteImage = await (uploaderClient.request as Request)('drive/files/update', {
			fileId: whiteImage.id,
			name: 'updated_white.webp',
			isSensitive: true,
		});

		const updatedWhiteImageInTwoServer = await (twoAdminClient.request as Request)('drive/files/show', {
			fileId: whiteImageInTwoServer.id,
		});

		await test('Update', async () => {
			console.log(`one.local: ${JSON.stringify(updatedWhiteImage, null, '\t')}`);
			console.log(`two.local: ${JSON.stringify(updatedWhiteImageInTwoServer, null, '\t')}`);
			// FIXME: not updated with `drive/files/update`
			deepEqual(updatedWhiteImage.isSensitive, true);
			deepEqual(updatedWhiteImage.name, 'updated_white.webp');
			deepEqual(updatedWhiteImageInTwoServer.isSensitive, false);
			deepEqual(updatedWhiteImageInTwoServer.name, 'white.webp');
		});

		const noteWithUpdatedWhiteImage = (await (uploaderClient.request as Request)('notes/create', { fileIds: [updatedWhiteImage.id] })).createdNote;
		const uriUpdated = `https://one.local/notes/${noteWithUpdatedWhiteImage.id}`;
		const noteWithUpdatedWhiteImageInTwoServer = await (async (): Promise<Misskey.entities.ApShowResponse & { type: 'Note' }> => {
			const resolved = await (twoAdminClient.request as Request)('ap/show', { uri: uriUpdated });
			deepEqual(resolved.type, 'Note');
			// @ts-expect-error we checked above assertion
			return resolved;
		})();
		deepEqual(noteWithUpdatedWhiteImageInTwoServer.object.uri, uriUpdated);
		deepEqual(noteWithUpdatedWhiteImageInTwoServer.object.files != null, true);
		deepEqual(noteWithUpdatedWhiteImageInTwoServer.object.files!.length, 1);
		const reupdatedWhiteImageInTwoServer = noteWithUpdatedWhiteImageInTwoServer.object.files![0];

		await test('Re-update with attaching to Note', async () => {
			console.log(`two.local: ${JSON.stringify(reupdatedWhiteImageInTwoServer, null, '\t')}`);
			// `isSensitive` is updated
			deepEqual(reupdatedWhiteImageInTwoServer.isSensitive, true);
			// FIXME: but `name` is not updated
			deepEqual(reupdatedWhiteImageInTwoServer.name, 'white.webp');
		});
	});
});
