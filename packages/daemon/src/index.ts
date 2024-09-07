import IPCIDR from 'ip-cidr';
import { Redis } from 'ioredis';

function getIpHash(ip: string) {
	const prefix = IPCIDR.createAddress(ip).mask(64);
	return `ip-${BigInt('0b' + prefix).toString(36)}`;
}

export async function purgeLimit(host: string) {
	const redisClient = new Redis({
		host: `redis.${host}`,
	});
	const ipHash = getIpHash(process.env.CLIENT_IP_ADDRESS!);

	const res = await redisClient.zrange(`${host}:limit:${ipHash}:signin`, 0, -1);
	console.log(`${host}:limit:${ipHash}:signin - ${res}`);
	if (res.length !== 0) {
		const res = await redisClient.del(`${host}:limit:${ipHash}:signin`);
		console.log(`deleted: ${res}`);
	}
}

setInterval(() => {
	purgeLimit('one.local');
	purgeLimit('two.local');
}, 2000);
