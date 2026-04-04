import axios from "axios";

const http = axios.create({
  baseURL: "/api",
  withCredentials: true,
  timeout: 15000,
  headers: {
    "X-Requested-With": "XMLHttpRequest",
  },
});

export default http;
