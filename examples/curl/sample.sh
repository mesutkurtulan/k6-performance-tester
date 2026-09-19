# Sample cURL commands for the mock API
curl http://127.0.0.1:4010/products

curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"test","price":1}' \
  http://127.0.0.1:4010/products

curl -X GET http://127.0.0.1:4010/products/1
