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

docker run -d --restart=always -p 80:3001 sunchainltd/muxout

# to make the bash script executable

chmod +x ./script.sh

./script.sh

docker system prune -a --volumes

{
"\_id": {
"$oid": "67389d71a214882e6d806f8c"
  },
  "userId": {
    "$oid": "67389d3ba214882e6d806f8b"
},
"type": "head",
"part": "face",
"scores": {
"overall": 63,
"lips": 60,
"grooming": 50,
"eyes": 70,
"skin": 75
},
"demographics": {
"sex": "male",
"ageInterval": "24-30",
"ethnicity": "white",
"skinColor": "fitzpatrick-2",
"skinType": "normal"
},
"images": [
{
"position": "front",
"mainUrl": {
"name": "eyes",
"url": "https://mux-data.nyc3.digitaloceanspaces.com/MYO-jidlY_U-7RNx1jiA-3nLx.webp"
},
"blurType": "eyes",
"urls": [
{
"url": "https://mux-data.nyc3.digitaloceanspaces.com/wEIssgJN1hkkU2ofVsQ-u.jpg",
"name": "original"
},
{
"name": "eyes",
"url": "https://mux-data.nyc3.digitaloceanspaces.com/MYO-jidlY_U-7RNx1jiA-3nLx.webp"
}
]
},
{
"position": "right",
"mainUrl": {
"name": "eyes",
"url": "https://mux-data.nyc3.digitaloceanspaces.com/MYO-GTnzsfE96OAVWE9UOJU6z.webp"
},
"blurType": "eyes",
"urls": [
{
"url": "https://mux-data.nyc3.digitaloceanspaces.com/Ako__FOsDedrJBk1z4nGn.jpg",
"name": "original"
},
{
"name": "eyes",
"url": "https://mux-data.nyc3.digitaloceanspaces.com/MYO-GTnzsfE96OAVWE9UOJU6z.webp"
}
]
},
{
"position": "left",
"mainUrl": {
"name": "eyes",
"url": "https://mux-data.nyc3.digitaloceanspaces.com/MYO-pDdWX4uu9dXv4rMWaT0xJ.webp"
},
"blurType": "eyes",
"urls": [
{
"url": "https://mux-data.nyc3.digitaloceanspaces.com/Yq4WRqtCBwpuZozNZ8_Mo.jpg",
"name": "original"
},
{
"name": "eyes",
"url": "https://mux-data.nyc3.digitaloceanspaces.com/MYO-pDdWX4uu9dXv4rMWaT0xJ.webp"
}
]
}
],
"initialImages": [
{
"position": "front",
"mainUrl": {
"name": "eyes",
"url": "https://mux-data.nyc3.digitaloceanspaces.com/MYO-jidlY_U-7RNx1jiA-3nLx.webp"
},
"blurType": "eyes",
"urls": [
{
"url": "https://mux-data.nyc3.digitaloceanspaces.com/wEIssgJN1hkkU2ofVsQ-u.jpg",
"name": "original"
},
{
"name": "eyes",
"url": "https://mux-data.nyc3.digitaloceanspaces.com/MYO-jidlY_U-7RNx1jiA-3nLx.webp"
}
]
},
{
"position": "right",
"mainUrl": {
"name": "eyes",
"url": "https://mux-data.nyc3.digitaloceanspaces.com/MYO-GTnzsfE96OAVWE9UOJU6z.webp"
},
"blurType": "eyes",
"urls": [
{
"url": "https://mux-data.nyc3.digitaloceanspaces.com/Ako__FOsDedrJBk1z4nGn.jpg",
"name": "original"
},
{
"name": "eyes",
"url": "https://mux-data.nyc3.digitaloceanspaces.com/MYO-GTnzsfE96OAVWE9UOJU6z.webp"
}
]
},
{
"position": "left",
"mainUrl": {
"name": "eyes",
"url": "https://mux-data.nyc3.digitaloceanspaces.com/MYO-pDdWX4uu9dXv4rMWaT0xJ.webp"
},
"blurType": "eyes",
"urls": [
{
"url": "https://mux-data.nyc3.digitaloceanspaces.com/Yq4WRqtCBwpuZozNZ8_Mo.jpg",
"name": "original"
},
{
"name": "eyes",
"url": "https://mux-data.nyc3.digitaloceanspaces.com/MYO-pDdWX4uu9dXv4rMWaT0xJ.webp"
}
]
}
],
"initialDate": {
"$date": "2024-11-16T13:25:56.834Z"
  },
  "createdAt": {
    "$date": "2024-11-16T13:25:56.834Z"
},
"concerns": [
{
"name": "ungroomed_facial_hair",
"explanation": "Your facial hair appears thick and could benefit from grooming to achieve a more defined look.",
"part": "face",
"importance": 1,
"isDisabled": false,
"type": "head"
},
{
"name": "oily_skin",
"explanation": "Your forehead and nose area have a noticeable shine, indicating excess oil production.",
"part": "face",
"importance": 2,
"isDisabled": false,
"type": "head"
}
],
"scoresDifference": {
"overall": 0,
"lips": 0,
"grooming": 0,
"eyes": 0,
"skin": 0
},
"explanation": "# Head analysis Sat Nov 16 2024\n\n## Lips\n- Score: 60\n- Explanation: The lips appear generally smooth with a slight dryness. There is no visible cracking, but they don't look perfectly moisturized either.\n\n## Grooming\n- Score: 50\n- Explanation: The beard is generally trimmed but has some uneven edges and stray hairs. It appears somewhat maintained but not perfectly shaped.\n\n## Eyes\n- Score: 70\n- Explanation: The images show minimal crow's feet and no significant under-eye bags or dark circles. The skin texture around the eyes appears smooth and firm, indicating a youthful appearance.\n\n## Skin\n- Score: 75\n- Explanation: The skin appears generally healthy with a smooth texture and even tone. There are no visible signs of acne or significant imperfections. The skin has a slight sheen, indicating a bit of oiliness, but overall it looks well-maintained.\n\n## Conclusion: \n\nThis person should address the following concerns to improve their appearance at this date:\n\n- ungroomed_facial_hair: Your facial hair appears thick and could benefit from grooming to achieve a more defined look.\n- oily_skin: Your forehead and nose area have a noticeable shine, indicating excess oil production.",
"specialConsiderations": null,
"isPublic": false,
"overall": 63
}
