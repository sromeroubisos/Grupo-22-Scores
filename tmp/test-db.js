const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Basic manual env loader
const envContent = fs.readFileSync('c:/Users/srome/OneDrive/Escritorio/Grupo-22-Scores/.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const [key, ...REST] = line.split('=');
  if (key && REST.length) env[key.trim()] = REST.join('=').trim();
});

async function test() {
  console.log('Using URL:', env.NEXT_PUBLIC_SUPABASE_URL);
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  
  const { data, error } = await supabase
    .from('sports')
    .select('*')
    .limit(1);
  
  if (error) {
    console.log('--- ERROR DETECTED ---');
    console.log('Code:', error.code);
    console.log('Message:', error.message);
    console.log('Details:', error.details);
    console.log('Hint:', error.hint);
    console.log('Full JSON:', JSON.stringify(error));
    process.exit(1);
  }
  console.log('--- SUCCESS ---');
  console.log('Data:', JSON.stringify(data, null, 2));
}

test();
