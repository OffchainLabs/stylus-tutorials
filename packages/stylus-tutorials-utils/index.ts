import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

// Logs an initial message by drawing a big A with blue dots
export const arbLog = async (text: string) => {
  let str = '🔵';
  for (let i = 0; i < 25; i++) {
    if (i == 12) {
      str = `🔵${'🔵'.repeat(i)}🔵`;
    } else {
      str = `🔵${' '.repeat(i * 2)}🔵`;
    }
    while (str.length < 60) {
      str = ` ${str} `;
    }

    console.log(str);
  }

  console.log('Arbitrum Demo:', text);
  console.log('Lets');
  console.log('Go ➡️');
  console.log('...🚀');
  console.log('');
};

// Draws a title surrounded by lines of '#'
export const arbLogTitle = (text: string) => {
  console.log('\n###################');
  console.log(text);
  console.log('###################');
};

// Checks that the environment variables specified have been loaded
export const requireEnvVariables = (envVars: string[]) => {
  for (const envVar of envVars) {
    if (!process.env[envVar]) {
      throw new Error(`Error: set your '${envVar}' environmental variable `);
    }
  }
  console.log('Environmental variables properly set');
};
