docker tag sunchainltd/muxout registry.digitalocean.com/muxout/muxout

docker push registry.digitalocean.com/muxout/muxout

docker save -o muxout.tar sunchainltd/muxout

sudo apt update

sudo apt install docker.io

sudo systemctl start docker

sudo systemctl enable docker

docker pull sunchainltd/muxout --no-cache

docker stop [ID]

docker rm [ID]

docker ps

docker run -d --restart=always -p 80:3001 --env-file env.list.txt sunchainltd/mux-api:1.1

# to make the bash script executable

chmod +x ./script.sh

./script.sh

docker system prune -a --volumes -f

db["Task"].updateMany(
{},
[{ $set: { status: "expired", startsAt: { $dateSubtract: { startDate: { $toDate: "$startsAt" }, unit: "day", amount: 7 } } } }]
)

db["Task"].updateMany(
{},
[{ $set: {status: "expired", expiresAt: { $dateSubtract: { startDate: { $toDate: "$expiresAt" }, unit: "day", amount: 7 } } } }]
)

db["Task"].deleteMany({routineId:ObjectId("67b895bee243b84ed3b0178d")})
