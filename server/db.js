import mysql from 'mysql2/promise'

const {
  MYSQL_HOST = '127.0.0.1',
  MYSQL_PORT = '3306',
  MYSQL_USER = 'root',
  MYSQL_PASSWORD = '',
  MYSQL_DATABASE = 'radio_app',
  MYSQL_CONNECTION_LIMIT = '10',
} = process.env

export const pool = mysql.createPool({
  host: MYSQL_HOST,
  port: Number(MYSQL_PORT),
  user: MYSQL_USER,
  password: MYSQL_PASSWORD,
  database: MYSQL_DATABASE,
  connectionLimit: Number(MYSQL_CONNECTION_LIMIT),
  namedPlaceholders: true,
  charset: 'utf8mb4',
})
