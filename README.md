# `misskey-local-federation`
You can demonstrate Misskey federation with Docker.

## Setup
Execute following commands:
```sh
bash ./generate.sh
cp ./.env.example ./.env
docker compose up
```

If the client exit with code 0, you can manually rerun with following command:
```sh
docker compose up client
```

<!-- If you hit rate limit erorrs, please change the client's IP address, which is specified in `./.env`. -->
