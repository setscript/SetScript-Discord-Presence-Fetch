import { NextResponse } from 'next/server';

export async function GET(request, { params }) {
  const userId = params.userId;

  try {
    const botResponse = await fetch(`http://localhost:3002/users/${userId}`);

    if (!botResponse.ok) {
      const errorData = await botResponse.json();
      throw new Error(errorData.error || `hata: ${botResponse.status}`);
    }

    const userData = await botResponse.json();
    return NextResponse.json(userData);

  } catch (error) {
    console.error(error);
    return new NextResponse(error.message || 'hata', { status: 500 });
  }
}