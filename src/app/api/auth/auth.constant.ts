export const resetPasswordEmail = (url: string) => {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Password Reset</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          background-color: #f4f4f4;
          color: #333;
          padding: 20px;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background-color: #fff;
          padding: 20px;
          border-radius: 8px;
          box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
        }
        .header {
          text-align: center;
          padding-bottom: 20px;
        }
        .header img {
          max-width: 100px;
        }
        .header h1 {
          margin: 0;
          color: #333;
        }
        .content {
          text-align: center;
        }
        .content p {
          font-size: 16px;
          line-height: 1.5;
          color: #666;
        }
        .content a {
          display: inline-block;
          padding: 10px 20px;
          margin-top: 20px;
          background-color: #007bff;
          color: #fff;
          text-decoration: none;
          border-radius: 5px;
          transition: background-color 0.3s ease;
        }
        .content a:hover {
          background-color: #0056b3;
        }
        .footer {
          text-align: center;
          padding-top: 20px;
          font-size: 12px;
          color: #999;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <img src="https://img.freepik.com/free-vector/creative-gradient-code-logo_23-2148820572.jpg?t=st=1719328161~exp=1719331761~hmac=2f59dbe79e6175cf6172f03709fd80ec4c660754968454b90b20e4e50c8baf31&w=740" alt="Logo">
          <h1>Password Reset Request</h1>
        </div>
        <div class="content">
          <p>Hello there,</p>
          <p>We received a request to reset your password.</p>
          <p>Click the button below to reset it.</p>
          <a href="${url}">Reset Password</a>
          <p>Please change password withen 10 minutes otherwise the link will be invalid.</p>
          <p>If you did not request a password reset, please ignore this email or contact support if you have questions.</p>
        </div>
        <div class="footer">
          <p>&copy; 2024 PH-University. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
    `;
};
