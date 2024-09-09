import IPCIDR from 'ip-cidr';
import { Redis } from 'ioredis';

function getIpHash(ip: string) {
	const prefix = IPCIDR.createAddress(ip).mask(64);
	return `ip-${BigInt('0b' + prefix).toString(36)}`;
}

export async function purgeLimit(host: string, client: Redis) {
	const ipHash = getIpHash(process.env.CLIENT_IP_ADDRESS!);

	const res = await client.zrange(`${host}:limit:${ipHash}:signin`, 0, -1);
	if (res.length !== 0) {
		console.log(`${host}:limit:${ipHash}:signin - ${JSON.stringify(res)}`);
		await client.del(`${host}:limit:${ipHash}:signin`);
		console.log(`${host}:limit:${ipHash}:signin - deleted`);
	}
}

{
	const redisClient = new Redis({
		host: 'redis.local',
	});

	setInterval(() => {
		purgeLimit('a.local', redisClient);
		purgeLimit('b.local', redisClient);
	}, 1000);
}
