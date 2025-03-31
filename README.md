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

curl -X DELETE https://api.stripe.com/v1/accounts/acct_1R8Nck2fhqcHNyzq -u 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
